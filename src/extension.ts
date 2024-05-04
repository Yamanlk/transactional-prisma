import { Prisma, PrismaClient } from "@prisma/client";
import { TRANSACTIONAL_CONTEXT } from "@transactional/core";
import { transaction } from "./flat-transaction";

const prismaTransactional = Prisma.defineExtension((prisma) => {
  return prisma.$extends({
    query: {
      $allOperations: async ({ args, model, operation, query }) => {
        const store = TRANSACTIONAL_CONTEXT.getStore();

        // query was not run in a @Transactional or was not allowed to use transaction
        if (!store) {
          return query(args);
        }

        /* this is the first query to run inside a transactional function, 
        so we need to create and attach the transaction to the store  */
        if (!store.tx) {
          /* create a transaction and assign it to the current store */
          store.tx = new Promise(async (resolve, reject) => {
            const tx = await transaction(prisma, store.options);
            store.$commit = tx.$commit;
            store.$rollback = tx.$rollback;

            resolve(tx);
          });
        }

        const tx = await store.tx;

        if (model) {
          return tx[model][operation](args);
        } else {
          return tx[operation](args);
        }
      },
    },
  });
});

export type TransactionalOptions = Parameters<PrismaClient["$transaction"]>[1];

export { prismaTransactional };
