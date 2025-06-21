import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { PrismaClient } from "@prisma/postgres";
import {
  Propagation,
  TRANSACTIONAL_CONTEXT,
  transactional,
} from "@transactional/core";
import assert from "node:assert";
import { Mock, beforeEach, describe, it, mock } from "node:test";
import { prismaTransactional } from "../../src";

describe("Postgres", () => {
  let baseClient = new PrismaClient({ log: ["query"] });
  let prisma = baseClient.$extends(prismaTransactional);

  beforeEach(async () => {
    await prisma.cat.deleteMany({});
  });

  it("should rollback in case of an error", async () => {
    // given
    const method = transactional(async () => {
      await prisma.cat.create({});
      throw new Error("");
    }, Propagation.REQUIRED);

    // when
    try {
      await method();
    } catch (error) {}
    const count = await prisma.cat.count();

    // then
    assert.equal(count, 0);
  });

  it("should run inside a non transactional method", async () => {
    // given
    const method = async () => {
      await transactional(async () => {
        await prisma.cat.create({});
      }, Propagation.REQUIRED)();
    };

    // when
    await method();
    const count = await prisma.cat.count();

    // then
    assert.equal(count, 1);
  });

  it("should not distrube an outer non transactional method", async () => {
    // given
    const method = async () => {
      await prisma.cat.create({});
      await transactional(async () => {
        await prisma.cat.create({});
        throw new Error();
      }, Propagation.REQUIRED)();
    };

    // when
    try {
      await method();
    } catch (error) {}
    const count = await prisma.cat.count();

    // then
    assert.equal(count, 1);
  });

  it("should commit once it ends", async () => {
    // given
    const method = async () => {
      await transactional(async () => {
        await prisma.cat.create({});
      }, Propagation.REQUIRED)();
      throw new Error();
    };

    // when
    try {
      await method();
    } catch (error) {}
    const count = await prisma.cat.count();

    // then
    assert.equal(count, 1);
  });

  it("should pass options", async () => {
    // given
    const method = async () => {
      await transactional<Parameters<PrismaClient["$transaction"]>[1]>(
        async () => {
          await prisma.cat.create({});
          await new Promise((res, rej) => {
            setTimeout(() => {
              res(true);
            }, 9_000);
          });
        },
        Propagation.REQUIRED,
        { timeout: 10_000 }
      )();
    };

    // when
    await method();
    const count = await prisma.cat.count();

    // then
    assert.equal(count, 1);
  });

  it("should throw source error after rollback", async () => {
    // given
    const method = async () => {
      await transactional(async () => {
        await prisma.cat.create({ data: { id: 1 } });
        await prisma.cat.create({ data: { id: 1 } });
      }, Propagation.REQUIRED)();
    };

    // when
    try {
      await method();
    } catch (error) {
      // then

      /* must throw unique constraint faild error */
      assert.ok((error as PrismaClientKnownRequestError).code === "P2002");
    }
  });

  it("should reject with rollback symbol", async () => {
    // given
    const method = transactional(async () => {
      await prisma.cat.create({ data: { id: 1 } });

      await TRANSACTIONAL_CONTEXT.getStore()?.$rollback!();
    }, Propagation.REQUIRED);

    // when
    try {
      await method();
    } catch (error) {
      // then

      assert.ok((error as any)[Symbol.for("prisma.client.extension.rollback")]);
    }
  });

  it("should support running multiple concurrent queries", async () => {
    // given

    mock.method(PrismaClient.prototype, "$transaction");
    const method = transactional(async () => {
      return Promise.all([prisma.cat.count(), prisma.cat.count()]);
    }, Propagation.REQUIRED);

    // when
    await method();

    // then
    assert.equal(
      (prisma.$transaction as Mock<PrismaClient["$transaction"]>).mock.calls
        .length,
      1
    );
  });
});
