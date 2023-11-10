import { Prisma, PrismaClient } from "@prisma/client";

export type FlatTransactionClient = Prisma.TransactionClient & {
  $commit: () => Promise<void>;
  $rollback: () => Promise<void>;
};

const ROLLBACK = { [Symbol.for("prisma.client.extension.rollback")]: true };

export async function transaction(
  prisma: PrismaClient,
  options?: Parameters<PrismaClient["$transaction"]>[1]
): Promise<FlatTransactionClient> {
  if (!isTransactionSupported(prisma)) {
    throw new Error("Transactions are not supported by this client");
  }

  let setTxClient: (tx: Prisma.TransactionClient) => void;

  let commit: () => void;
  let rollback: () => void;
  const txPromise = new Promise((resolve, reject) => {
    commit = () => resolve(undefined);
    rollback = () => reject(ROLLBACK);
  });
  const txClient: Promise<Prisma.TransactionClient> =
    new Promise<Prisma.TransactionClient>((resolve, reject) => {
      setTxClient = (tx) => resolve(tx);
    });

  const tx = prisma["$transaction"]((tx: Prisma.TransactionClient) => {
    setTxClient(tx);

    return txPromise;
  }, options);

  return new Proxy(await txClient, {
    get(target, prop) {
      if (prop === "$commit") {
        return () => {
          commit();
          return tx;
        };
      }
      if (prop === "$rollback") {
        return () => {
          rollback();
          return tx;
        };
      }
      return target[prop as keyof typeof target];
    },
  }) as FlatTransactionClient;
}

function isTransactionSupported(prisma: PrismaClient): boolean {
  if (
    "$transaction" in prisma &&
    typeof prisma["$transaction"] === "function"
  ) {
    return true;
  } else {
    return false;
  }
}
