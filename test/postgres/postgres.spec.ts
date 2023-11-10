import { PrismaClient } from "@prisma/postgres";
import { Propagation, transactional } from "@transactional/core";
import assert from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { prismaTransactional } from "../../src";

describe("Postgres", () => {
  let prisma = new PrismaClient({}).$extends(prismaTransactional);

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
});
