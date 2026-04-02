import { afterEach, describe, expect, it, vi } from "vitest";

import { ProcessingKey, processing } from "../../../app/common/utils/processing";

function applyDecorator(target: object, methodName: string) {
  const descriptor = Object.getOwnPropertyDescriptor(target, methodName);
  if (!descriptor) {
    throw new Error(`Missing descriptor for ${methodName}`);
  }
  processing(ProcessingKey.General)(target, methodName, descriptor);
  Object.defineProperty(target, methodName, descriptor);
}

describe("processing decorator", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).PLUIAPI;
  });

  it("does not throw when PLUIAPI is absent in async contexts", async () => {
    class AsyncWorker {
      async run(value: number) {
        return value + 1;
      }
    }

    applyDecorator(AsyncWorker.prototype, "run");

    await expect(new AsyncWorker().run(1)).resolves.toBe(2);
  });

  it("tracks processing state through globalThis PLUIAPI without bare global access", async () => {
    const increaseProcessingState = vi.fn();
    const decreaseProcessingState = vi.fn();
    (globalThis as Record<string, unknown>).PLUIAPI = {
      uiStateService: {
        processingState: {},
        increaseProcessingState,
        decreaseProcessingState,
      },
    };

    class AsyncWorker {
      async run(value: number) {
        return value + 1;
      }
    }

    applyDecorator(AsyncWorker.prototype, "run");

    await expect(new AsyncWorker().run(2)).resolves.toBe(3);
    expect(increaseProcessingState).toHaveBeenCalledWith(ProcessingKey.General);
    expect(decreaseProcessingState).toHaveBeenCalledWith(ProcessingKey.General);
  });

  it("decreases processing state after sync errors", () => {
    const increaseProcessingState = vi.fn();
    const decreaseProcessingState = vi.fn();
    (globalThis as Record<string, unknown>).PLUIAPI = {
      uiStateService: {
        processingState: {},
        increaseProcessingState,
        decreaseProcessingState,
      },
    };

    class SyncWorker {
      run() {
        throw new Error("boom");
      }
    }

    applyDecorator(SyncWorker.prototype, "run");

    expect(() => new SyncWorker().run()).toThrow("boom");
    expect(increaseProcessingState).toHaveBeenCalledWith(ProcessingKey.General);
    expect(decreaseProcessingState).toHaveBeenCalledWith(ProcessingKey.General);
  });
});
