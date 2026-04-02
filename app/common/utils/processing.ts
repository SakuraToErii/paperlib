// =========================================
// Processing State Sub State
export enum ProcessingKey {
  General = "general",
}

function getUIStateService() {
  return globalThis["PLUIAPI"]?.uiStateService as
    | {
        processingState?: unknown;
        increaseProcessingState: (key: ProcessingKey) => void;
        decreaseProcessingState: (key: ProcessingKey) => void;
      }
    | undefined;
}

function hasProcessingState(
  uiStateService: ReturnType<typeof getUIStateService>
): uiStateService is NonNullable<ReturnType<typeof getUIStateService>> {
  return (
    !!uiStateService?.processingState &&
    typeof uiStateService.increaseProcessingState === "function" &&
    typeof uiStateService.decreaseProcessingState === "function"
  );
}

/**
 * Processing decorator for a method. It will increment the processing count and decrement it when the method is done
 * to trigger something such as a spinner.
 * @param key
 */
export function processing(key: ProcessingKey) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const isAsync = originalMethod.constructor.name === "AsyncFunction";

    if (isAsync) {
      descriptor.value = async function (...args: any[]) {
        const uiStateService = getUIStateService();
        if (hasProcessingState(uiStateService)) {
          uiStateService.increaseProcessingState(key);

          try {
            const results = await originalMethod.apply(this, args);
            uiStateService.decreaseProcessingState(key);
            return results;
          } catch (error) {
            uiStateService.decreaseProcessingState(key);
            throw error;
          }
        } else {
          return await originalMethod.apply(this, args);
        }
      };
    } else {
      descriptor.value = function (...args: any[]) {
        const uiStateService = getUIStateService();
        if (hasProcessingState(uiStateService)) {
          uiStateService.increaseProcessingState(key);
          try {
            const results = originalMethod.apply(this, args);
            uiStateService.decreaseProcessingState(key);
            return results;
          } catch (error) {
            uiStateService.decreaseProcessingState(key);
            throw error;
          }
        } else {
          return originalMethod.apply(this, args);
        }
      };
    }
  };
}

export interface IProcessingState {
  general: number;
}
