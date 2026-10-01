import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import {
  mdiCellphoneArrowDown,
  mdiChevronDown,
  mdiDatabaseOutline,
  mdiFormatFont,
  mdiPaletteOutline,
  mdiShuffleVariant,
  mdiUpdate,
  mdiViewDashboardOutline,
} from '@mdi/js';
import { useTitle } from '../components/Layout';
import { RandomPoemCard, type RandomPoemPreview } from '../components/RandomPoemCard';
import { RandomCategoryTree } from '../components/RandomCategoryTree';
import { Icon } from '../components/ui';
import { workerDb } from '../db/client';
import { toPersianNumber } from '../lib/format';
import { requestPersistentStorage } from '../state/downloads';
import { promptInstall, useCanInstall } from '../state/install';
import {
  FONT_OPTIONS,
  FONT_SIZE,
  poemFontStyle,
  RANDOM_LAYOUT_OPTIONS,
  THEME_OPTIONS,
  updateSettings,
  useSettings,
} from '../state/settings';
import { showToast } from '../state/toast';
import { applyUpdate, checkForUpdate, useUpdateState } from '../state/update';
import { S } from '../strings';

const SAMPLE_PREVIEW: RandomPoemPreview = {
  path: {
    poem: { id: 0, title: 'آغاز داستان', categoryId: 0 },
    poet: { id: 0, name: 'فردوسی', description: '', imageUrl: null },
    categories: [{ id: 0, text: 'شاهنامه', parentId: 0, poetId: 0, randomSelected: true }],
  },
  verses: S.settingVerses[0].map((text, i) => ({ id: i, text, verseOrder: i + 1, position: i, poemId: 0 })),
};

type SectionProps = {
  id: string;
  icon: string;
  title: string;
  summary?: ReactNode;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
};

/** A settings card that shows only its title and current value until expanded. */
function SettingsSection({ id, icon, title, summary, open, onToggle, children }: SectionProps) {
  return (
    <section className={`card settings-section collapsible ${open ? 'open' : ''}`} id={id}>
      <button
        type="button"
        className="settings-section-header"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => onToggle(id)}
      >
        <Icon path={icon} size={22} className="settings-section-icon" />
        <span className="settings-section-title">
          <h3>{title}</h3>
          {summary && !open && <span className="muted small">{summary}</span>}
        </span>
        <Icon path={mdiChevronDown} size={22} className="settings-section-chevron" />
      </button>
      {open && (
        <div className="settings-section-body" id={`${id}-body`}>
          {children}
        </div>
      )}
    </section>
  );
}

function StorageSection() {
  const [info, setInfo] = useState<{ kind: string; persisted: boolean; usage?: number } | null>(null);
  useEffect(() => {
    void (async () => {
      const kind = await workerDb.init();
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const estimate = await navigator.storage?.estimate?.();
      setInfo({ kind, persisted, usage: estimate?.usage });
    })();
  }, []);

  const status =
    info?.kind === 'memory' ? S.storageMemory : info?.persisted ? S.storagePersistent : S.storageBestEffort;

  return (
    <>
      <p className="muted">{status}</p>
      {info?.usage != null && (
        <p className="muted">
          {S.storageUsage}: {toPersianNumber((info.usage / 1024 / 1024).toFixed(1))} مگابایت
        </p>
      )}
      {info && !info.persisted && info.kind !== 'memory' && (
        <button
          type="button"
          className="button text"
          onClick={async () => {
            const persisted = await requestPersistentStorage();
            setInfo({ ...info, persisted });
          }}
        >
          درخواست ذخیره‌سازی ماندگار
        </button>
      )}
    </>
  );
}

const BUILD_DATE = new Date(__BUILD_TIME__).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

function UpdateSection() {
  const { needRefresh } = useUpdateState();
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    const result = await checkForUpdate();
    setChecking(false);
    if (result === 'latest') showToast(S.upToDate, 'success');
    else if (result === 'failed') showToast(S.updateCheckFailed, 'error');
    else if (result === 'unsupported') showToast(S.updateUnsupported, 'error');
  };

  return (
    <>
      <p className="muted">
        {S.appVersion} {toPersianNumber(__APP_VERSION__)} · {S.appBuiltAt} {BUILD_DATE}
      </p>
      {needRefresh && <p>{S.updateAvailable}</p>}
      <div className="button-row start">
        {needRefresh ? (
          <button type="button" className="button filled" onClick={() => void applyUpdate()}>
            {S.update}
          </button>
        ) : (
          <button type="button" className="button tonal" disabled={checking} onClick={() => void check()}>
            <Icon path={mdiUpdate} size={18} />
            {checking ? S.checkingForUpdate : S.checkForUpdate}
          </button>
        )}
      </div>
    </>
  );
}

const SECTION_IDS = ['theme', 'font', 'random-layout', 'random', 'storage', 'update'];

export default function SettingsPage() {
  useTitle(S.settings);
  const settings = useSettings();
  const canInstall = useCanInstall();
  const { needRefresh } = useUpdateState();
  const location = useLocation();
  const hashId = location.hash.slice(1);
  const [openId, setOpenId] = useState<string | null>(SECTION_IDS.includes(hashId) ? hashId : null);

  useEffect(() => {
    if (!hashId) return;
    if (SECTION_IDS.includes(hashId)) setOpenId(hashId);
    document.getElementById(hashId)?.scrollIntoView({ behavior: 'smooth' });
  }, [hashId]);

  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id));
  const section = (id: string) => ({ id, open: openId === id, onToggle: toggle });

  const themeLabel = THEME_OPTIONS.find((o) => o.value === settings.theme)?.label;
  const fontLabel = FONT_OPTIONS.find((f) => f.value === settings.poemFont)?.label;
  const layoutLabel = RANDOM_LAYOUT_OPTIONS.find((o) => o.value === settings.randomPoemLayout)?.label;

  return (
    <div className="page settings">
      {canInstall && (
        <section className="card settings-section">
          <h3>{S.installApp}</h3>
          <p className="muted">{S.installAppDescription}</p>
          <button type="button" className="button filled" onClick={() => void promptInstall()}>
            <Icon path={mdiCellphoneArrowDown} size={18} />
            {S.installApp}
          </button>
        </section>
      )}

      <SettingsSection {...section('theme')} icon={mdiPaletteOutline} title={S.appTheme} summary={themeLabel}>
        <div className="segmented" role="radiogroup" aria-label={S.appTheme}>
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={settings.theme === o.value}
              className={settings.theme === o.value ? 'selected' : ''}
              onClick={() => updateSettings({ theme: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        {...section('font')}
        icon={mdiFormatFont}
        title={S.font}
        summary={`${fontLabel} · ${toPersianNumber(settings.poemFontSizePercent)}٪`}
      >
        <div className="font-options" role="radiogroup" aria-label={S.font}>
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={settings.poemFont === f.value}
              className={`font-option ${settings.poemFont === f.value ? 'selected' : ''}`}
              style={{ fontFamily: f.family }}
              onClick={() => updateSettings({ poemFont: f.value })}
            >
              {f.label}
            </button>
          ))}
        </div>
        <h4>{S.fontSize}</h4>
        <div className="slider-row">
          <span style={{ fontSize: 14 }}>آ</span>
          <input
            type="range"
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            step={FONT_SIZE.step}
            value={settings.poemFontSizePercent}
            aria-label={S.fontSize}
            onChange={(e) => updateSettings({ poemFontSizePercent: Number(e.target.value) })}
          />
          <span style={{ fontSize: 24 }}>آ</span>
        </div>
        <button type="button" className="button text" onClick={() => updateSettings({ poemFontSizePercent: FONT_SIZE.default, poemFont: 'Dana' })}>
          {S.resetToDefault}
        </button>
        <div className="font-sample" style={poemFontStyle(settings)}>
          {S.settingVerses.map(([a, b]) => (
            <div key={a} className="beyt">
              <p>{a}</p>
              <p>{b}</p>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection {...section('random-layout')} icon={mdiViewDashboardOutline} title={S.randomPoemLayout} summary={layoutLabel}>
        <div className="segmented wrap" role="radiogroup" aria-label={S.randomPoemLayout}>
          {RANDOM_LAYOUT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={settings.randomPoemLayout === o.value}
              className={settings.randomPoemLayout === o.value ? 'selected' : ''}
              onClick={() => updateSettings({ randomPoemLayout: o.value, randomPoemLayoutIntroSeen: true })}
            >
              {o.label}
            </button>
          ))}
        </div>
        <RandomPoemCard layout={settings.randomPoemLayout} preview={SAMPLE_PREVIEW} />
      </SettingsSection>

      <SettingsSection {...section('random')} icon={mdiShuffleVariant} title={S.randomPoemCategorySelection}>
        <p className="muted">{S.randomPoemCategoryDescription}</p>
        <RandomCategoryTree />
      </SettingsSection>

      <SettingsSection {...section('storage')} icon={mdiDatabaseOutline} title={S.storage}>
        <StorageSection />
      </SettingsSection>

      <SettingsSection
        {...section('update')}
        icon={mdiUpdate}
        title={S.appUpdate}
        summary={needRefresh ? S.updateAvailable : `${S.appVersion} ${toPersianNumber(__APP_VERSION__)}`}
      >
        <UpdateSection />
      </SettingsSection>
    </div>
  );
}
