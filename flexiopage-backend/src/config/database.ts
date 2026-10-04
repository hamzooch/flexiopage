import mongoose from 'mongoose';
import { logger } from '../lib/logger';

/**
 * Connexion Mongoose avec limites explicites. Les valeurs par défaut
 * (poolSize ~100, serverSelectionTimeoutMS 30 s, pas de socketTimeout) nous
 * ont déjà causé deux fois des "connections piling up" en prod : une query
 * lente ou un Mongo saturé laissait les requêtes s'empiler jusqu'à l'OOM
 * du process backend. Avec ces bornes :
 *   - maxPoolSize 50          : plus que suffisant pour un seul node Mongo,
 *                               évite de saturer le mongod côté serveur.
 *   - serverSelectionTimeoutMS: si Mongo ne répond pas en 5 s au boot, on
 *                               échoue vite (le compose relance tout seul).
 *   - socketTimeoutMS         : coupe les sockets qui dorment > 45 s.
 *   - heartbeatFrequencyMS    : check de santé plus fréquent → détection
 *                               rapide d'un failover en replica set.
 *
 * Les events de connexion sont loggés en WARN/ERROR plutôt que silencieux :
 * sans ça, un disconnect pouvait durer des minutes avant qu'on s'en aperçoive.
 */
export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/flexiopage';

  mongoose.connection.on('connected', () => {
    logger.info({ host: mongoose.connection.host, name: mongoose.connection.name }, 'MongoDB connected');
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected — driver va tenter de reconnecter.');
  });
  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });
  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error');
  });

  await mongoose.connect(uri, {
    maxPoolSize: 50,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
    // retryWrites + retryReads sont déjà true par défaut sur le driver v6+ ;
    // on les laisse implicites. En replica set, ça couvre les failovers.
  });
}

/**
 * Ferme proprement la connexion Mongo. Appelé par le graceful shutdown pour
 * laisser les transactions en cours finir avant que le process ne meure.
 */
export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
