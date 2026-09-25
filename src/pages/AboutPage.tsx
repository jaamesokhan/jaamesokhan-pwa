import { mdiEmailOutline, mdiGithub, mdiHeartOutline, mdiWeb } from '@mdi/js';
import { useTitle } from '../components/Layout';
import { Icon } from '../components/ui';
import { LINKS, S } from '../strings';
import logo from '../assets/name-logo.svg?raw';

export default function AboutPage() {
  useTitle(S.aboutTitle);
  return (
    <div className="page about">
      <div className="about-logo" dangerouslySetInnerHTML={{ __html: logo }} />
      <section className="card settings-section">
        <p>{S.aboutBase}</p>
        <p>{S.aboutWebsite}</p>
        <a className="button tonal" href={LINKS.website} target="_blank" rel="noreferrer">
          <Icon path={mdiWeb} size={18} />
          {S.website}
        </a>
        <p>{S.aboutGithub}</p>
        <a className="button tonal" href={LINKS.github} target="_blank" rel="noreferrer">
          <Icon path={mdiGithub} size={18} />
          GitHub
        </a>
      </section>
      <section className="card settings-section">
        <h3>{S.supportTitle}</h3>
        <p>{S.aboutSupport}</p>
        <div className="button-row start">
          <a className="button filled" href={LINKS.hamibash} target="_blank" rel="noreferrer">
            <Icon path={mdiHeartOutline} size={18} />
            {S.beSupportive}
          </a>
          <a className="button filled" href={LINKS.daramet} target="_blank" rel="noreferrer">
            <Icon path={mdiHeartOutline} size={18} />
            {S.daramet}
          </a>
        </div>
      </section>
      <section className="card settings-section">
        <h3>{S.contributionTitle}</h3>
        <p>{S.aboutEmail}</p>
        <a className="button tonal" href={LINKS.email}>
          <Icon path={mdiEmailOutline} size={18} />
          jaamesokhan@gmail.com
        </a>
      </section>
      <p className="muted center">{S.copyRight}</p>
      <p className="muted center small">نسخه {__APP_VERSION__}</p>
    </div>
  );
}
