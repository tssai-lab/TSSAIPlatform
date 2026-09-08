#!/usr/bin/env python3
"""甲方新装前的只读检查；兼容 Python 3.8，不安装或修改任何系统设置。"""

import argparse
import json
import os
import platform
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path


def read_os_release(text):
    result = {}
    for line in text.splitlines():
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, raw = line.split('=', 1)
        if key not in ('ID', 'VERSION_ID', 'PRETTY_NAME'):
            continue
        values = shlex.split(raw)
        if len(values) == 1:
            result[key] = values[0]
    return result


def version_pair(value):
    match = re.match(r'^(\d+)\.(\d+)(?:\D|$)', str(value))
    return tuple(map(int, match.groups())) if match else None


def nearest_existing_directory(value):
    candidate = Path(value)
    if not candidate.is_absolute():
        raise ValueError('项目数据路径必须是绝对路径')
    if '..' in candidate.parts:
        raise ValueError('项目数据路径不能含上级目录跳转')
    # 不跟随符号链接，以免项目路径实际指向其他人的存储目录。
    for part in [candidate] + list(candidate.parents):
        if part.is_symlink():
            raise ValueError('项目数据路径及父目录不能是符号链接')
    while not candidate.exists():
        candidate = candidate.parent
    if not candidate.is_dir():
        raise ValueError('项目数据路径指向文件而不是目录')
    return candidate


def run_readonly(command):
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=10, text=True, check=False)
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def collect(data_path):
    target = nearest_existing_directory(data_path)
    os_file = Path('/etc/os-release')
    system = read_os_release(os_file.read_text()) if os_file.is_file() else {}
    memory = {}
    mem_file = Path('/proc/meminfo')
    if mem_file.is_file():
        for line in mem_file.read_text().splitlines():
            key, _, raw = line.partition(':')
            if key in ('MemTotal', 'MemAvailable'):
                memory[key] = int(raw.split()[0]) * 1024
    gpu_text = run_readonly(['nvidia-smi', '--query-gpu=name,driver_version,memory.total',
                            '--format=csv,noheader,nounits'])
    tools = {name: bool(shutil.which(name)) for name in
             ('docker', 'containerd', 'kubeadm', 'kubelet', 'kubectl', 'nvidia-container-runtime')}
    return {
        'system': platform.system(), 'os': system, 'architecture': platform.machine(),
        'kernel': platform.release(), 'cgroup_v2': Path('/sys/fs/cgroup/cgroup.controllers').is_file(),
        'cpu_logical_cores': os.cpu_count(), 'memory_bytes': memory,
        'data_path': str(data_path), 'checked_existing_parent': str(target),
        'data_filesystem_free_bytes': shutil.disk_usage(target).free,
        'root_filesystem_free_bytes': shutil.disk_usage(Path('/')).free,
        'gpu_summary': gpu_text.splitlines() if gpu_text else [], 'commands': tools,
        'existing_kubernetes': Path('/etc/kubernetes/admin.conf').exists()
        or Path('/etc/kubernetes/kubelet.conf').exists(),
    }


def assess(facts):
    """目标是发现准备工作，不把未装依赖或未做功能验收伪装成可交付。"""
    failures = []
    warnings = []
    os_info = facts.get('os', {})
    version = version_pair(os_info.get('VERSION_ID', ''))
    if facts.get('system') != 'Linux' or os_info.get('ID') != 'ubuntu':
        failures.append('本交付路径要求 Ubuntu；其他系统不能套用 Ubuntu 离线包。')
    elif version is None or version < (20, 4):
        failures.append('Ubuntu 版本无法识别或低于 20.04 支持目标。')
    else:
        warnings.append('Ubuntu {} 属于适配目标，但本检查不证明该版本已实机验收。'.format(
            os_info.get('VERSION_ID')))
    if facts.get('architecture') not in ('x86_64', 'amd64'):
        failures.append('当前镜像交付基线为 linux/amd64，不可直接用于其他 CPU 架构。')
    kernel = version_pair(facts.get('kernel', ''))
    if kernel is None or kernel < (5, 8):
        failures.append('当前 cgroup v2 路径要求 Linux 内核至少 5.8；先规划内核准备，不自动升级。')
    if facts.get('cgroup_v2') is not True:
        failures.append('尚未启用 cgroup v2；需按系统版本准备并在获准重启后复查。')
    if not facts.get('gpu_summary'):
        failures.append('NVIDIA 驱动未能报告 GPU；需准备或修复驱动，不能证明 GPU 可用于训练。')
    if facts.get('existing_kubernetes'):
        failures.append('发现已有 Kubernetes 配置；先确认归属，不可作为空机初始化。')
    missing = [name for name, available in facts.get('commands', {}).items() if not available]
    if missing:
        warnings.append('待由对应 Ubuntu 离线依赖包安装：' + ', '.join(missing))
    warnings.append('尚未检查镜像完整性、端口/网段冲突、资源预留、磁盘容量预算和真实训练。')
    return {'status': 'not_ready' if failures else 'basic_compatible',
            'failures': failures, 'warnings': warnings, 'installation_verified': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-path', required=True, help='计划使用的项目数据绝对路径；不会创建目录')
    args = parser.parse_args()
    try:
        facts = collect(args.data_path)
        result = dict(facts=facts, assessment=assess(facts))
    except (OSError, ValueError) as exc:
        print(json.dumps({'error': str(exc), 'installation_verified': False}, ensure_ascii=False))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result['assessment']['failures'] else 0


if __name__ == '__main__':
    sys.exit(main())
