import { ArrowRightOutlined, DeploymentUnitOutlined, EditOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Link, useModel } from '@umijs/max';
import { useEffect } from 'react';
import { AvatarDropdown, AvatarName } from '@/components';
import { redirectToLogin } from '@/utils/loginRedirect';
import styles from './index.less';

export default function Platforms() {
  const { initialState } = useModel('@@initialState');
  const user = initialState?.currentUser;
  useEffect(() => {
    if (!user) redirectToLogin({ replace: true });
  }, [user]);
  if (!user) return null;

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <header className={styles.header}>
        <Link to="/platforms" className={styles.brand} aria-label="TSS AI 平台选择">
          <strong>TSS<span>/</span></strong><small>AI PLATFORM</small>
        </Link>
        <AvatarDropdown><button className={styles.account} type="button"><AvatarName /></button></AvatarDropdown>
      </header>
      <section className={styles.content} aria-labelledby="platform-title">
        <div className={styles.intro}>
          <span className={styles.eyebrow}>YOUR AI WORKSPACE</span>
          <h1 id="platform-title">一个空间，<br />开启 AI 的更多可能<span>。</span></h1>
          <p>欢迎回来，{user.name || user.username}。选择一个平台，开始今天的工作。</p>
        </div>
        <div className={styles.grid}>
          <Link to="/dashboard" className={`${styles.card} ${styles.training}`}>
            <div className={styles.cardTop}><DeploymentUnitOutlined /><span className={styles.live}>可用</span></div>
            <div className={styles.orbit} aria-hidden="true"><i /><i /><i /><b>TSS</b></div>
            <div className={styles.cardBody}><small>MODEL TRAINING</small><h2>训练平台</h2><p>从数据与代码到模型训练，<br />在统一工作台管理你的 AI 实验。</p></div>
            <div className={styles.cardBottom}><span>进入训练平台</span><ArrowRightOutlined /></div>
          </Link>
          <article className={`${styles.card} ${styles.pending}`}>
            <div className={styles.cardTop}><EditOutlined /><span className={styles.badge}>开发中</span></div>
            <div className={styles.visual} aria-hidden="true"><div className={styles.annotation}><span /><span /><span /></div></div>
            <div className={styles.cardBody}><small>DATA ANNOTATION</small><h2>数据标注平台</h2><p>让数据拥有清晰的语义，<br />为模型准备高质量的标注资产。</p></div>
            <div className={styles.cardBottom}><span>敬请期待</span><span>即将开放</span></div>
          </article>
          <article className={`${styles.card} ${styles.pending}`}>
            <div className={styles.cardTop}><SafetyCertificateOutlined /><span className={styles.badge}>待接入</span></div>
            <div className={styles.visual} aria-hidden="true"><SafetyCertificateOutlined className={styles.shield} /></div>
            <div className={styles.cardBody}><small>AGENT SECURITY</small><h2>智能体安全平台</h2><p>探索智能体的安全边界，<br />让每一次智能交互更值得信赖。</p></div>
            <div className={styles.cardBottom}><span>敬请期待</span><span>后续接入</span></div>
          </article>
        </div>
      </section>
      <footer className={styles.footer}><span>TSS AI 平台 · 连接数据与智能</span><span>数据 · 训练 · 安全</span></footer>
    </main>
  );
}
