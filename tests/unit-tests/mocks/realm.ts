class MockList<T> extends Array<T> {}
class MockResults<T> extends Array<T> {}
class MockRealmObject<T = unknown, RequiredProperties extends keyof T = never> {}

const Realm = {
  Object: MockRealmObject,
  List: MockList,
  Results: MockResults,
};

export { MockList as List, MockResults as Results };
export default Realm;
