import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '@prisma/client';

export const DB = (database: D1Database) => {
	const adapter = new PrismaD1(database);
	return new PrismaClient({ adapter });
};

export default DB;
