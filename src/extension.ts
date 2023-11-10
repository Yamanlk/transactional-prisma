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

        const tx = (store.tx =
          store.tx ?? (await transaction(prisma, store.options)));

        store.$commit = tx.$commit;
        store.$rollback = tx.$rollback;

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
