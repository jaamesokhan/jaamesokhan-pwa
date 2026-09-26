import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import {
  mdiBellOutline,
  mdiCellphoneArrowDown,
  mdiChevronDown,
  mdiDatabaseExportOutline,
  mdiDatabaseImportOutline,
  mdiDatabaseOutline,
  mdiFormatFont,
  mdiPaletteOutline,
  mdiShuffleVariant,
  mdiViewDashboardOutline,
} from '@mdi/js';
import { useTitle } from '../components/Layout';
import { RandomPoemCard, type RandomPoemPreview } from '../components/RandomPoemCard';
import { RandomCategoryTree } from '../components/RandomCategoryTree';
import { ConfirmDialog, Icon } from '../components/ui';
import { workerDb } from '../db/client';
import { isDailyPoemSupported, setDailyPoem } from '../lib/dailyPoem';
import { toPersianNumber } from '../lib/format';
import { downloadBlob } from '../lib/share';
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
  const [confirmRestore, setConfirmRestore] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const kind = await workerDb.init();
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const estimate = await navigator.storage?.estimate?.();
      setInfo({ kind, persisted, usage: estimate?.usage });
    })();
  }, []);

  const exportBackup = async () => {
    const data = await workerDb.exportDb();
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(data, `jaamesokhan-backup-${date}.sqlite3`, 'application/vnd.sqlite3');
  };

  const restore = async (file: File) => {
    try {
      await workerDb.importDb(await file.arrayBuffer());
      showToast(S.backupImported, 'success');
    } catch (e) {
      console.error(e);
      showToast(S.backupFailed, 'error');
    }
  };

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
      <div className="button-row start">
        <button type="button" className="button tonal" onClick={() => void exportBackup()}>
          <Icon path={mdiDatabaseExportOutline} size={18} />
          {S.backupExport}
        </button>
        <button type="button" className="button tonal" disabled={info?.kind === 'memory'} onClick={() => fileInput.current?.click()}>
          <Icon path={mdiDatabaseImportOutline} size={18} />
          {S.backupImport}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".sqlite3,.sqlite,.db,application/vnd.sqlite3,application/octet-stream"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) setConfirmRestore(file);
          }}
        />
      </div>
      <ConfirmDialog
        open={confirmRestore != null}
        message={S.backupImportConfirm}
        danger
        onCancel={() => setConfirmRestore(null)}
        onConfirm={() => {
          const file = confirmRestore!;
          setConfirmRestore(null);
          void restore(file);
        }}
      />
    </>
  );
}

function DailyPoemSection() {
  const settings = useSettings();
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    void isDailyPoemSupported().then(setSupported);
  }, []);

  const apply = async (enabled: boolean, time: string) => {
    const ok = await setDailyPoem(enabled, time);
    if (!ok && enabled) {
      showToast(S.dailyRandomPoemUnsupported, 'error', 6000);
      updateSettings({ dailyPoemEnabled: false });
      return;
    }
    updateSettings({ dailyPoemEnabled: enabled, dailyPoemTime: time });
  };

  return (
    <>
      <label className="switch-row">
        <span>
          <strong>{S.dailyRandomPoemNotification}</strong>
          <span className="muted">{S.dailyRandomPoemNotificationDescription}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          disabled={!supported}
          checked={settings.dailyPoemEnabled && !!supported}
          onChange={(e) => void apply(e.target.checked, settings.dailyPoemTime)}
        />
      </label>
      {supported === false && <p className="muted small">{S.dailyRandomPoemUnsupported}</p>}
      {supported && settings.dailyPoemEnabled && (
        <label className="inline-field">
          <span>{S.dailyRandomPoemTimeLabel}</span>
          <input type="time" value={settings.dailyPoemTime} onChange={(e) => void apply(true, e.target.value)} />
        </label>
      )}
    </>
  );
}

const SECTION_IDS = ['theme', 'font', 'random-layout', 'random', 'daily', 'storage'];

export default function SettingsPage() {
  useTitle(S.settings);
  const settings = useSettings();
  const canInstall = useCanInstall();
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

      <SettingsSection
        {...section('daily')}
        icon={mdiBellOutline}
        title={S.dailyRandomPoemNotification}
        summary={settings.dailyPoemEnabled ? toPersianNumber(settings.dailyPoemTime) : undefined}
      >
        <DailyPoemSection />
      </SettingsSection>

      <SettingsSection {...section('storage')} icon={mdiDatabaseOutline} title={S.storage}>
        <StorageSection />
      </SettingsSection>
    </div>
  );
}
