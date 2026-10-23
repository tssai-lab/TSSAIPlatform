"""为独立 Demo 创建三个演示账号；密码只保存到仓库外。"""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import stat
import string
import subprocess
import sys
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ROLES = {'demo_root': 1, 'demo_admin': 2, 'demo_user': 3}
REMOTE_REQUEST = '''import json, sys, urllib.request
payload = json.load(sys.stdin)
request = urllib.request.Request('http://backend:8080/api/user/' + payload['path'],
    data=json.dumps(payload['body']).encode(), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(request, timeout=20) as response:
    print(response.read().decode())
'''


def compose(arguments: list[str], payload: str | None = None) -> str:
    result = subprocess.run(
        ['docker', 'compose', '-f', str(ROOT / 'deploy/compose.yml'), *arguments],
        input=payload, text=True, capture_output=True,
    )
    if result.returncode:
        # 不回显子进程输出，防止认证响应、SQL 或配置泄露密码。
        raise RuntimeError('Docker Compose 命令失败；请检查环境变量、容器状态和后端日志')
    return result.stdout


def api(path: str, body: dict[str, Any]) -> dict[str, Any]:
    output = compose(['exec', '-T', 'manual-label-api', 'python', '-c', REMOTE_REQUEST],
                     json.dumps({'path': path, 'body': body}))
    return json.loads(output)


def load_accounts(path: Path) -> dict[str, str]:
    path = path.expanduser().resolve()
    if path == ROOT or ROOT in path.parents:
        raise ValueError('账号文件必须保存在仓库目录之外')
    if path.exists():
        if not stat.S_ISREG(path.stat().st_mode) or path.stat().st_mode & 0o077:
            raise ValueError('现有账号文件必须为普通文件且权限为 600')
        accounts = json.loads(path.read_text())
        if not isinstance(accounts, dict) or set(accounts) != set(ROLES):
            raise ValueError('账号文件格式不正确，需包含三个指定账号')
        if any(not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_]{6,16}', value) for value in accounts.values()):
            raise ValueError('账号文件中的密码不符合接口规则')
        return accounts
    path.parent.mkdir(parents=True, exist_ok=True)
    accounts = {name: ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16)) for name in ROLES}
    # 先保存随机密码，网络中断后再次执行可恢复，且不覆盖现有文件。
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        json.dump(accounts, output, ensure_ascii=False, indent=2)
        output.flush()
        os.fsync(output.fileno())
    return accounts


def initialize(accounts: dict[str, str]) -> None:
    for username, role in ROLES.items():
        password = accounts[username]
        credentials = {'username': username, 'password': password}
        login = api('login', {**credentials, 'type': 'account'})
        if login.get('code') != 200:
            registered = api('register/username', {**credentials, 'confirmPassword': password})
            if registered.get('code') != 200:
                raise RuntimeError(f'{username} 无法创建：可能已存在且密码不同；未覆盖原账号')
            login = api('login', {**credentials, 'type': 'account'})
            if login.get('code') != 200:
                raise RuntimeError(f'{username} 注册后登录失败，请检查后端')
        # 用户名和角色只取自固定白名单；先验证密码，再设置角色，不重置已有密码。
        sql = (f"UPDATE users SET role_id={role}, updated_at=CURRENT_TIMESTAMP "
               f"WHERE username='{username}' AND deleted_at IS NULL AND status=TRUE RETURNING id;")
        result = compose(['exec', '-T', 'postgres', 'psql', '-X', '-q', '-t', '-A',
                          '-v', 'ON_ERROR_STOP=1', '-U', 'tss', '-d', 'tss'], sql)
        if not result.strip().isdigit():
            raise RuntimeError(f'{username} 角色设置失败')
        verified = api('login', {**credentials, 'type': 'account'})
        if verified.get('code') != 200 or verified.get('data', {}).get('roleId') != role:
            raise RuntimeError(f'{username} 登录角色校验失败')
        print(f'{username} 已就绪（角色 {role}）')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--accounts-file', type=Path, default=Path.home() / '.config/tss-demo/accounts.json')
    args = parser.parse_args()
    try:
        accounts = load_accounts(args.accounts_file)
        initialize(accounts)
        print(f'密码文件：{args.accounts_file.expanduser().resolve()}（仅当前用户可读）')
        print('登录地址：http://127.0.0.1:' + os.environ.get('DEMO_PORT', '8014') + '/#/user/login')
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
