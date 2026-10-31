-- Demo 首次部署的固定演示账号，密码均为 123456，数据库只保存 BCrypt 哈希。
-- 已有同名账号保持原密码、角色和状态，不覆盖现有数据。
INSERT INTO users (username, email, password, role_id, status)
VALUES
    ('admin01', 'admin01@demo.local', '$2a$10$2tqH40CEfpKBp42Lex.MdOIjxPui89MB9aKWv6f1hrtPNc6R8nF4a', 2, TRUE),
    ('user01', 'user01@demo.local', '$2a$10$FL3YVDeE.xnh2RTKaP8cg.3XfxRLnJ5pT.Zw0aH8jV9GS8TCCLQvi', 3, TRUE)
ON CONFLICT (username) DO NOTHING;
