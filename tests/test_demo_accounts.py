"""验证账号初始化的角色、重复执行和密码保护，不连接真实服务。"""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('demo_accounts', Path(__file__).resolve().parents[1] / 'deploy/init-demo-accounts.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AccountsTest(unittest.TestCase):
    def test_initialization_and_repeat(self) -> None:
        path = Path(tempfile.mkdtemp(prefix='demo-accounts-test-')) / 'accounts.json'
        accounts = module.load_accounts(path)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(module.load_accounts(path), accounts)
        self.assertEqual(len(set(accounts.values())), 3)
        users = {}
        registrations = []

        def api(route: str, body: dict) -> dict:
            name = body['username']
            if route == 'register/username':
                registrations.append(name)
                users[name] = {'password': body['password'], 'role': 3}
                return {'code': 200}
            user = users.get(name)
            if user and user['password'] == body['password']:
                return {'code': 200, 'data': {'roleId': user['role']}}
            return {'code': 400}

        def compose(arguments: list[str], payload: str) -> str:
            self.assertNotIn(accounts['demo_root'], ' '.join(arguments))
            for name, role in module.ROLES.items():
                if f"username='{name}'" in payload:
                    self.assertIn(f'role_id={role}', payload)
                    users[name]['role'] = role
                    return '1\n'
            raise AssertionError('出现非预期的用户名')

        with patch.object(module, 'api', side_effect=api), patch.object(module, 'compose', side_effect=compose), contextlib.redirect_stdout(io.StringIO()) as output:
            module.initialize(accounts)
            module.initialize(accounts)
        self.assertEqual(registrations, list(module.ROLES))
        self.assertEqual({name: user['role'] for name, user in users.items()}, module.ROLES)
        for password in accounts.values():
            self.assertNotIn(password, output.getvalue())

    def test_conflict_and_unsafe_file(self) -> None:
        with self.assertRaises(ValueError):
            module.load_accounts(module.ROOT / 'accounts.json')
        with patch.object(module, 'api', return_value={'code': 400}), patch.object(module, 'compose') as compose:
            with self.assertRaisesRegex(RuntimeError, '未覆盖原账号'):
                module.initialize({name: 'TestOnly1234' for name in module.ROLES})
            compose.assert_not_called()
        path = Path(tempfile.mkdtemp(prefix='demo-accounts-test-')) / 'accounts.json'
        module.load_accounts(path)
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            module.load_accounts(path)


if __name__ == '__main__':
    unittest.main()
