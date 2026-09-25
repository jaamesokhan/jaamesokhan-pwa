// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseAudioSync } from './index';

const XML = `<?xml version="1.0" encoding="utf-8"?>
<DesktopGanjoorPoemAudioList>
  <PoemAudio>
    <PoemId>2130</PoemId>
    <OneSecondBugFix>1000</OneSecondBugFix>
    <SyncArray>
      <SyncInfo><VerseOrder>1</VerseOrder><AudioMiliseconds>4000</AudioMiliseconds></SyncInfo>
      <SyncInfo><VerseOrder>0</VerseOrder><AudioMiliseconds>1500</AudioMiliseconds></SyncInfo>
      <SyncInfo><VerseOrder>-1</VerseOrder><AudioMiliseconds>9000</AudioMiliseconds></SyncInfo>
    </SyncArray>
  </PoemAudio>
</DesktopGanjoorPoemAudioList>`;

describe('parseAudioSync', () => {
  it('reads offset and sorted sync points', () => {
    expect(parseAudioSync(XML)).toEqual({
      offsetMs: 1000,
      points: [
        { verseOrder: 0, ms: 1500 },
        { verseOrder: 1, ms: 4000 },
        { verseOrder: -1, ms: 9000 },
      ],
    });
  });

  it('accepts the JSON-quoted form with escaped newlines', () => {
    const quoted = JSON.stringify(XML).replace(/\\"/g, '"');
    expect(parseAudioSync(quoted)?.points).toHaveLength(3);
  });

  it('returns null for garbage', () => {
    expect(parseAudioSync('not xml')).toBeNull();
  });
});
