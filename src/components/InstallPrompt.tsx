import { useEffect, useState } from 'react';
import { mdiClose, mdiExportVariant } from '@mdi/js';
import {
  dismissInstallPrompt,
  installPromptDismissedRecently,
  isIosSafari,
  isStandalone,
  promptInstall,
  useCanInstall,
} from '../state/install';
import { S } from '../strings';
import { Icon, IconButton } from './ui';

const SHOW_DELAY_MS = 2500;

/** "Install the app" card shown on entry in the browser, until installed or dismissed (for a week). */
export function InstallPrompt() {
  const canInstall = useCanInstall();
  const [ios] = useState(isIosSafari);
  const [eligible] = useState(() => !isStandalone() && !installPromptDismissedRecently());
  const [delayPassed, setDelayPassed] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDelayPassed(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  if (!eligible || !delayPassed || closed || !(canInstall || ios)) return null;

  const close = () => {
    dismissInstallPrompt();
    setClosed(true);
  };
  const [beforeShare, rest] = S.installPromptIos.split('{share}');
  const [beforeAdd, afterAdd] = rest.split('{add}');

  return (
    <div className="install-prompt" role="dialog" aria-label={S.installPromptTitle}>
      <img src="/pwa-192x192.png" alt="" width={48} height={48} />
      <div className="install-prompt-text">
        <strong>{S.installPromptTitle}</strong>
        {canInstall ? (
          <span>{S.installPromptDescription}</span>
        ) : (
          <span>
            {beforeShare}
            <Icon path={mdiExportVariant} size={18} className="inline-icon" />
            {beforeAdd}
            {/* Safari's own (English) label; isolated so it doesn't scramble the Persian sentence around it. */}
            <bdi dir="ltr" className="install-prompt-label">Add to Home Screen</bdi>
            {afterAdd}
          </span>
        )}
        <div className="install-prompt-actions">
          {canInstall ? (
            <>
              <button type="button" className="button text" onClick={close}>
                {S.notNow}
              </button>
              <button
                type="button"
                className="button filled"
                onClick={() => {
                  setClosed(true);
                  void promptInstall();
                }}
              >
                {S.install}
              </button>
            </>
          ) : (
            <button type="button" className="button text" onClick={close}>
              {S.gotIt}
            </button>
          )}
        </div>
      </div>
      <IconButton icon={mdiClose} label={S.close} onClick={close} />
    </div>
  );
}
