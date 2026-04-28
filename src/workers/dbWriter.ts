import { MongoClient } from 'mongodb';
import { createLogger } from '../lib/logger';
import type { TelemetryRecord } from '../lib/telemetry';

const log = createLogger('db-worker');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB || 'nimbus';
const COLLECTION = process.env.MONGO_COLLECTION || 'telemetry';

let client: MongoClient | null = null;
let collection: any = null;

async function connect() {
  if (client) return;

  client = new MongoClient(MONGO_URI);
  await client.connect();
  const database = client.db(DB_NAME);
  const collections = await database.listCollections({ name: COLLECTION }).toArray();

  if (collections.length === 0) {
    try {
      await database.createCollection(COLLECTION, {
        timeseries: { timeField: 'timestamp', metaField: 'deviceId', granularity: 'seconds' }
      });
      log.info({ collection: COLLECTION }, 'created time-series collection');
    } catch (error) {
      log.warn({ error, collection: COLLECTION }, 'could not create collection');
    }
  }

  collection = database.collection(COLLECTION);
}

export async function flushRecords(records: TelemetryRecord[], emit: (payload: unknown) => void) {
  try {
    await connect();
    const documents = records.map((record) => ({ ...record, timestamp: new Date(record.timestamp) }));

    if (documents.length === 0) {
      emit({ action: 'log', msg: 'nothing to insert' });
      return;
    }

    const result = await collection.insertMany(documents);
    emit({ action: 'log', msg: `inserted ${result.insertedCount} documents` });
  } catch (error) {
    log.error({ error }, 'failed to flush records');
    emit({ action: 'error', error: String(error) });
  }
}
