// Local database schema. Mirrors the Android client's Room entities (database/AppDatabase.kt),
// with FTS5 instead of FTS4 (the sqlite-wasm build ships FTS5 only).
// Each entry is one migration; PRAGMA user_version records how many have been applied.

export const MIGRATIONS: string[] = [
  `
  CREATE TABLE poets (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT,
    download_status TEXT NOT NULL DEFAULT 'Downloaded'
  );

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    parent_id INTEGER NOT NULL,
    poet_id INTEGER NOT NULL REFERENCES poets(id) ON DELETE CASCADE,
    random_selected INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX index_categories_poet_id ON categories(poet_id);
  CREATE INDEX index_categories_parent_id ON categories(parent_id);

  CREATE TABLE poems (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE
  );
  CREATE INDEX index_poems_category_id ON poems(category_id);

  CREATE TABLE verses (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    verse_order INTEGER NOT NULL,
    position INTEGER NOT NULL,
    poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
    normalized_text TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX index_verses_poem_id ON verses(poem_id, verse_order);

  CREATE VIRTUAL TABLE verses_fts USING fts5(normalized_text, content=verses, content_rowid=id);
  CREATE TRIGGER verses_fts_ai AFTER INSERT ON verses BEGIN
    INSERT INTO verses_fts(rowid, normalized_text) VALUES (new.id, new.normalized_text);
  END;
  CREATE TRIGGER verses_fts_ad AFTER DELETE ON verses BEGIN
    INSERT INTO verses_fts(verses_fts, rowid, normalized_text) VALUES ('delete', old.id, old.normalized_text);
  END;
  CREATE TRIGGER verses_fts_au AFTER UPDATE ON verses BEGIN
    INSERT INTO verses_fts(verses_fts, rowid, normalized_text) VALUES ('delete', old.id, old.normalized_text);
    INSERT INTO verses_fts(rowid, normalized_text) VALUES (new.id, new.normalized_text);
  END;

  CREATE TABLE highlights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_id INTEGER NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
    start_index INTEGER NOT NULL,
    end_index INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    color TEXT NOT NULL,
    group_id TEXT NOT NULL
  );
  CREATE INDEX index_highlights_verse_id ON highlights(verse_id, created_at);
  CREATE INDEX index_highlights_group_id ON highlights(group_id);

  CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poem_id INTEGER NOT NULL UNIQUE REFERENCES poems(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX index_comments_poem_id ON comments(poem_id);

  CREATE TABLE history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poem_id INTEGER NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
    timestamp INTEGER NOT NULL
  );
  CREATE INDEX index_history_poem_id ON history(poem_id);

  CREATE TABLE search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL UNIQUE,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE bookmark_label_cross_refs (
    bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (bookmark_id, label_id)
  );
  CREATE INDEX index_bookmark_label_cross_refs_label_id ON bookmark_label_cross_refs(label_id);

  CREATE TABLE highlight_label_cross_refs (
    highlight_id INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (highlight_id, label_id)
  );
  CREATE INDEX index_highlight_label_cross_refs_label_id ON highlight_label_cross_refs(label_id);
  `,
];
