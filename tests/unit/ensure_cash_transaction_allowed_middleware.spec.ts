import { test } from "@japa/runner";
import db from "@adonisjs/lucid/services/db";
import EnsureCashTransactionAllowedMiddleware from "#middleware/ensure_cash_transaction_allowed_middleware";
import CashRegisterOperatingService, {
  CASH_REGISTER_PREVIOUS_BUSINESS_DAY,
} from "#services/cash_register_operating_service";

function createTransaction() {
  let completed = false;
  let commits = 0;
  let rollbacks = 0;

  return {
    get isCompleted() {
      return completed;
    },
    get commits() {
      return commits;
    },
    get rollbacks() {
      return rollbacks;
    },
    async commit() {
      completed = true;
      commits += 1;
    },
    async rollback() {
      completed = true;
      rollbacks += 1;
    },
  };
}

function createResponse() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    internalServerErrorCalls: 0,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return payload;
    },
    badRequest(payload: unknown) {
      this.statusCode = 400;
      this.body = payload;
      return payload;
    },
    internalServerError(payload: unknown) {
      this.internalServerErrorCalls += 1;
      this.statusCode = 500;
      this.body = payload;
      return payload;
    },
  };
}

function createState(overrides: Record<string, unknown> = {}) {
  return {
    status: "open_current",
    sessionId: 28,
    sessionBusinessDate: "2026-08-18",
    currentBusinessDate: "2026-08-18",
    businessDayCutoffHour: 4,
    isPreviousBusinessDay: false,
    recoveryIsActive: false,
    ...overrides,
  };
}

async function withOperatingState(
  state: Record<string, unknown>,
  callback: (trx: ReturnType<typeof createTransaction>) => Promise<void>,
) {
  const mutableDb = db as any;
  const trx = createTransaction();
  const originalTransaction = mutableDb.transaction;
  const originalGetState = CashRegisterOperatingService.prototype.getState;
  const originalApplyState =
    CashRegisterOperatingService.prototype.applyStateToContext;

  mutableDb.transaction = async () => trx;
  CashRegisterOperatingService.prototype.getState = async () => state as any;
  CashRegisterOperatingService.prototype.applyStateToContext = () => {};

  try {
    await callback(trx);
  } finally {
    mutableDb.transaction = originalTransaction;
    CashRegisterOperatingService.prototype.getState = originalGetState;
    CashRegisterOperatingService.prototype.applyStateToContext =
      originalApplyState;
  }
}

test.group("Ensure cash transaction allowed middleware", () => {
  test("preserves downstream errors and rolls back the shared transaction", async ({
    assert,
  }) => {
    await withOperatingState(createState(), async (trx) => {
      const response = createResponse();
      const ctx = {
        companyId: 1,
        locationId: 9,
        request: { method: () => "POST" },
        response,
      } as any;
      const downstreamError = new Error("validation failed");
      const middleware = new EnsureCashTransactionAllowedMiddleware();
      let receivedError: unknown;

      try {
        await middleware.handle(ctx, async () => {
          throw downstreamError;
        });
      } catch (error) {
        receivedError = error;
      }

      assert.strictEqual(receivedError, downstreamError);
      assert.equal(trx.rollbacks, 1);
      assert.equal(trx.commits, 0);
      assert.equal(response.internalServerErrorCalls, 0);
    });
  });

  test("returns 409 when an older cash session has no active recovery", async ({
    assert,
  }) => {
    await withOperatingState(
      createState({
        status: "open_previous",
        sessionBusinessDate: "2026-08-13",
        isPreviousBusinessDay: true,
      }),
      async (trx) => {
        const response = createResponse();
        const ctx = {
          companyId: 1,
          locationId: 9,
          request: { method: () => "POST" },
          response,
        } as any;
        let nextCalls = 0;

        await new EnsureCashTransactionAllowedMiddleware().handle(
          ctx,
          async () => {
            nextCalls += 1;
          },
        );

        assert.equal(response.statusCode, 409);
        assert.equal(
          (response.body as { code: string }).code,
          CASH_REGISTER_PREVIOUS_BUSINESS_DAY,
        );
        assert.equal(nextCalls, 0);
        assert.equal(trx.rollbacks, 1);
        assert.equal(trx.commits, 0);
      },
    );
  });

  test("commits after an allowed downstream operation", async ({ assert }) => {
    await withOperatingState(createState(), async (trx) => {
      const response = createResponse();
      const ctx = {
        companyId: 1,
        locationId: 9,
        request: { method: () => "POST" },
        response,
      } as any;
      let nextCalls = 0;

      await new EnsureCashTransactionAllowedMiddleware().handle(
        ctx,
        async () => {
          nextCalls += 1;
        },
      );

      assert.equal(nextCalls, 1);
      assert.equal(trx.commits, 1);
      assert.equal(trx.rollbacks, 0);
    });
  });
});
