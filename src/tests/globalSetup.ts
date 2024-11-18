import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from '$lib/db/test';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

export const setup = async () => {
    // Run migrations on the test database
    console.log('Running migrations');
    await migrate(db, {
        migrationsFolder: './migrations'
    }) ;
};

export const teardown = async () => {
    // Close the database connection
    // await fs.unlink(getDbPath());
    console.log('Closing database connection');
};
