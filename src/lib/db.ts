import { MongoClient, type Db } from "mongodb";

const FALLBACK_DB_NAME = process.env.DATABASE_NAME ?? "hpo_chat";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClient(): Promise<MongoClient> {
  if (!global._mongoClientPromise) {
    const url = process.env.MONGODB_URL;
    if (!url) throw new Error("MONGODB_URL is not set");
    global._mongoClientPromise = new MongoClient(url).connect();
  }
  return global._mongoClientPromise;
}

let indexesEnsured = false;

async function ensureIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  await Promise.all([
    db.collection("users").createIndex({ username: 1 }, { unique: true }),
    db
      .collection("pre_keys")
      .createIndex({ user_id: 1, key_id: 1 }, { unique: true }),
    db.collection("conversations").createIndex({ participant_ids: 1 }),
    db.collection("messages").createIndex({ conversation_id: 1 }),
    db
      .collection("messages")
      .createIndex({ recipient_id: 1, delivered: 1 }),
  ]);
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  // client.db() with no arg uses the database from the connection string;
  // fall back to FALLBACK_DB_NAME if the URL has none.
  const db = client.db(client.options.dbName || FALLBACK_DB_NAME);
  await ensureIndexes(db);
  return db;
}
