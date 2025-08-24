true && function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
      }
    }
  }).observe(document, {
    childList: true,
    subtree: true
  });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep) return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
}();

const IS_DEV = false;
const equalFn = (a, b) => a === b;
const $PROXY = Symbol("solid-proxy");
const SUPPORTS_PROXY = typeof Proxy === "function";
const $TRACK = Symbol("solid-track");
const signalOptions = {
  equals: equalFn
};
let runEffects = runQueue;
const STALE = 1;
const PENDING = 2;
const UNOWNED = {
  owned: null,
  cleanups: null,
  context: null,
  owner: null
};
const NO_INIT = {};
var Owner = null;
let Transition = null;
let ExternalSourceConfig = null;
let Listener = null;
let Updates = null;
let Effects = null;
let ExecCount = 0;
function createRoot(fn, detachedOwner) {
  const listener = Listener,
    owner = Owner,
    unowned = fn.length === 0,
    current = detachedOwner === undefined ? owner : detachedOwner,
    root = unowned ? UNOWNED : {
      owned: null,
      cleanups: null,
      context: current ? current.context : null,
      owner: current
    },
    updateFn = unowned ? fn : () => fn(() => untrack(() => cleanNode(root)));
  Owner = root;
  Listener = null;
  try {
    return runUpdates(updateFn, true);
  } finally {
    Listener = listener;
    Owner = owner;
  }
}
function createSignal(value, options) {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions;
  const s = {
    value,
    observers: null,
    observerSlots: null,
    comparator: options.equals || undefined
  };
  const setter = value => {
    if (typeof value === "function") {
      value = value(s.value);
    }
    return writeSignal(s, value);
  };
  return [readSignal.bind(s), setter];
}
function createComputed(fn, value, options) {
  const c = createComputation(fn, value, true, STALE);
  updateComputation(c);
}
function createRenderEffect(fn, value, options) {
  const c = createComputation(fn, value, false, STALE);
  updateComputation(c);
}
function createEffect(fn, value, options) {
  runEffects = runUserEffects;
  const c = createComputation(fn, value, false, STALE);
  if (!options || !options.render) c.user = true;
  Effects ? Effects.push(c) : updateComputation(c);
}
function createMemo(fn, value, options) {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions;
  const c = createComputation(fn, value, true, 0);
  c.observers = null;
  c.observerSlots = null;
  c.comparator = options.equals || undefined;
  updateComputation(c);
  return readSignal.bind(c);
}
function isPromise(v) {
  return v && typeof v === "object" && "then" in v;
}
function createResource(pSource, pFetcher, pOptions) {
  let source;
  let fetcher;
  let options;
  {
    source = true;
    fetcher = pSource;
    options = {};
  }
  let pr = null,
    initP = NO_INIT,
    scheduled = false,
    resolved = "initialValue" in options,
    dynamic = typeof source === "function" && createMemo(source);
  const contexts = new Set(),
    [value, setValue] = (options.storage || createSignal)(options.initialValue),
    [error, setError] = createSignal(undefined),
    [track, trigger] = createSignal(undefined, {
      equals: false
    }),
    [state, setState] = createSignal(resolved ? "ready" : "unresolved");
  function loadEnd(p, v, error, key) {
    if (pr === p) {
      pr = null;
      key !== undefined && (resolved = true);
      if ((p === initP || v === initP) && options.onHydrated) queueMicrotask(() => options.onHydrated(key, {
        value: v
      }));
      initP = NO_INIT;
      completeLoad(v, error);
    }
    return v;
  }
  function completeLoad(v, err) {
    runUpdates(() => {
      if (err === undefined) setValue(() => v);
      setState(err !== undefined ? "errored" : resolved ? "ready" : "unresolved");
      setError(err);
      for (const c of contexts.keys()) c.decrement();
      contexts.clear();
    }, false);
  }
  function read() {
    const c = SuspenseContext,
      v = value(),
      err = error();
    if (err !== undefined && !pr) throw err;
    if (Listener && !Listener.user && c) {
      createComputed(() => {
        track();
        if (pr) {
          if (c.resolved && Transition) ;else if (!contexts.has(c)) {
            c.increment();
            contexts.add(c);
          }
        }
      });
    }
    return v;
  }
  function load(refetching = true) {
    if (refetching !== false && scheduled) return;
    scheduled = false;
    const lookup = dynamic ? dynamic() : source;
    if (lookup == null || lookup === false) {
      loadEnd(pr, untrack(value));
      return;
    }
    let error;
    const p = initP !== NO_INIT ? initP : untrack(() => {
      try {
        return fetcher(lookup, {
          value: value(),
          refetching
        });
      } catch (fetcherError) {
        error = fetcherError;
      }
    });
    if (error !== undefined) {
      loadEnd(pr, undefined, castError(error), lookup);
      return;
    } else if (!isPromise(p)) {
      loadEnd(pr, p, undefined, lookup);
      return p;
    }
    pr = p;
    if ("v" in p) {
      if (p.s === 1) loadEnd(pr, p.v, undefined, lookup);else loadEnd(pr, undefined, castError(p.v), lookup);
      return p;
    }
    scheduled = true;
    queueMicrotask(() => scheduled = false);
    runUpdates(() => {
      setState(resolved ? "refreshing" : "pending");
      trigger();
    }, false);
    return p.then(v => loadEnd(p, v, undefined, lookup), e => loadEnd(p, undefined, castError(e), lookup));
  }
  Object.defineProperties(read, {
    state: {
      get: () => state()
    },
    error: {
      get: () => error()
    },
    loading: {
      get() {
        const s = state();
        return s === "pending" || s === "refreshing";
      }
    },
    latest: {
      get() {
        if (!resolved) return read();
        const err = error();
        if (err && !pr) throw err;
        return value();
      }
    }
  });
  let owner = Owner;
  if (dynamic) createComputed(() => (owner = Owner, load(false)));else load(false);
  return [read, {
    refetch: info => runWithOwner(owner, () => load(info)),
    mutate: setValue
  }];
}
function batch(fn) {
  return runUpdates(fn, false);
}
function untrack(fn) {
  if (Listener === null) return fn();
  const listener = Listener;
  Listener = null;
  try {
    if (ExternalSourceConfig) ;
    return fn();
  } finally {
    Listener = listener;
  }
}
function on$1(deps, fn, options) {
  const isArray = Array.isArray(deps);
  let prevInput;
  let defer = options && options.defer;
  return prevValue => {
    let input;
    if (isArray) {
      input = Array(deps.length);
      for (let i = 0; i < deps.length; i++) input[i] = deps[i]();
    } else input = deps();
    if (defer) {
      defer = false;
      return prevValue;
    }
    const result = untrack(() => fn(input, prevInput, prevValue));
    prevInput = input;
    return result;
  };
}
function onMount(fn) {
  createEffect(() => untrack(fn));
}
function onCleanup(fn) {
  if (Owner === null) ;else if (Owner.cleanups === null) Owner.cleanups = [fn];else Owner.cleanups.push(fn);
  return fn;
}
function getListener() {
  return Listener;
}
function getOwner() {
  return Owner;
}
function runWithOwner(o, fn) {
  const prev = Owner;
  const prevListener = Listener;
  Owner = o;
  Listener = null;
  try {
    return runUpdates(fn, true);
  } catch (err) {
    handleError(err);
  } finally {
    Owner = prev;
    Listener = prevListener;
  }
}
const [transPending, setTransPending] = /*@__PURE__*/createSignal(false);
function createContext(defaultValue, options) {
  const id = Symbol("context");
  return {
    id,
    Provider: createProvider(id),
    defaultValue
  };
}
function useContext(context) {
  let value;
  return Owner && Owner.context && (value = Owner.context[context.id]) !== undefined ? value : context.defaultValue;
}
function children(fn) {
  const children = createMemo(fn);
  const memo = createMemo(() => resolveChildren(children()));
  memo.toArray = () => {
    const c = memo();
    return Array.isArray(c) ? c : c != null ? [c] : [];
  };
  return memo;
}
let SuspenseContext;
function readSignal() {
  if (this.sources && (this.state)) {
    if ((this.state) === STALE) updateComputation(this);else {
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(this), false);
      Updates = updates;
    }
  }
  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0;
    if (!Listener.sources) {
      Listener.sources = [this];
      Listener.sourceSlots = [sSlot];
    } else {
      Listener.sources.push(this);
      Listener.sourceSlots.push(sSlot);
    }
    if (!this.observers) {
      this.observers = [Listener];
      this.observerSlots = [Listener.sources.length - 1];
    } else {
      this.observers.push(Listener);
      this.observerSlots.push(Listener.sources.length - 1);
    }
  }
  return this.value;
}
function writeSignal(node, value, isComp) {
  let current = node.value;
  if (!node.comparator || !node.comparator(current, value)) {
    node.value = value;
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers.length; i += 1) {
          const o = node.observers[i];
          const TransitionRunning = Transition && Transition.running;
          if (TransitionRunning && Transition.disposed.has(o)) ;
          if (TransitionRunning ? !o.tState : !o.state) {
            if (o.pure) Updates.push(o);else Effects.push(o);
            if (o.observers) markDownstream(o);
          }
          if (!TransitionRunning) o.state = STALE;
        }
        if (Updates.length > 10e5) {
          Updates = [];
          if (IS_DEV) ;
          throw new Error();
        }
      }, false);
    }
  }
  return value;
}
function updateComputation(node) {
  if (!node.fn) return;
  cleanNode(node);
  const time = ExecCount;
  runComputation(node, node.value, time);
}
function runComputation(node, value, time) {
  let nextValue;
  const owner = Owner,
    listener = Listener;
  Listener = Owner = node;
  try {
    nextValue = node.fn(value);
  } catch (err) {
    if (node.pure) {
      {
        node.state = STALE;
        node.owned && node.owned.forEach(cleanNode);
        node.owned = null;
      }
    }
    node.updatedAt = time + 1;
    return handleError(err);
  } finally {
    Listener = listener;
    Owner = owner;
  }
  if (!node.updatedAt || node.updatedAt <= time) {
    if (node.updatedAt != null && "observers" in node) {
      writeSignal(node, nextValue);
    } else node.value = nextValue;
    node.updatedAt = time;
  }
}
function createComputation(fn, init, pure, state = STALE, options) {
  const c = {
    fn,
    state: state,
    updatedAt: null,
    owned: null,
    sources: null,
    sourceSlots: null,
    cleanups: null,
    value: init,
    owner: Owner,
    context: Owner ? Owner.context : null,
    pure
  };
  if (Owner === null) ;else if (Owner !== UNOWNED) {
    {
      if (!Owner.owned) Owner.owned = [c];else Owner.owned.push(c);
    }
  }
  return c;
}
function runTop(node) {
  if ((node.state) === 0) return;
  if ((node.state) === PENDING) return lookUpstream(node);
  if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
  const ancestors = [node];
  while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
    if (node.state) ancestors.push(node);
  }
  for (let i = ancestors.length - 1; i >= 0; i--) {
    node = ancestors[i];
    if ((node.state) === STALE) {
      updateComputation(node);
    } else if ((node.state) === PENDING) {
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(node, ancestors[0]), false);
      Updates = updates;
    }
  }
}
function runUpdates(fn, init) {
  if (Updates) return fn();
  let wait = false;
  if (!init) Updates = [];
  if (Effects) wait = true;else Effects = [];
  ExecCount++;
  try {
    const res = fn();
    completeUpdates(wait);
    return res;
  } catch (err) {
    if (!wait) Effects = null;
    Updates = null;
    handleError(err);
  }
}
function completeUpdates(wait) {
  if (Updates) {
    runQueue(Updates);
    Updates = null;
  }
  if (wait) return;
  const e = Effects;
  Effects = null;
  if (e.length) runUpdates(() => runEffects(e), false);
}
function runQueue(queue) {
  for (let i = 0; i < queue.length; i++) runTop(queue[i]);
}
function runUserEffects(queue) {
  let i,
    userLength = 0;
  for (i = 0; i < queue.length; i++) {
    const e = queue[i];
    if (!e.user) runTop(e);else queue[userLength++] = e;
  }
  for (i = 0; i < userLength; i++) runTop(queue[i]);
}
function lookUpstream(node, ignore) {
  node.state = 0;
  for (let i = 0; i < node.sources.length; i += 1) {
    const source = node.sources[i];
    if (source.sources) {
      const state = source.state;
      if (state === STALE) {
        if (source !== ignore && (!source.updatedAt || source.updatedAt < ExecCount)) runTop(source);
      } else if (state === PENDING) lookUpstream(source, ignore);
    }
  }
}
function markDownstream(node) {
  for (let i = 0; i < node.observers.length; i += 1) {
    const o = node.observers[i];
    if (!o.state) {
      o.state = PENDING;
      if (o.pure) Updates.push(o);else Effects.push(o);
      o.observers && markDownstream(o);
    }
  }
}
function cleanNode(node) {
  let i;
  if (node.sources) {
    while (node.sources.length) {
      const source = node.sources.pop(),
        index = node.sourceSlots.pop(),
        obs = source.observers;
      if (obs && obs.length) {
        const n = obs.pop(),
          s = source.observerSlots.pop();
        if (index < obs.length) {
          n.sourceSlots[s] = index;
          obs[index] = n;
          source.observerSlots[index] = s;
        }
      }
    }
  }
  if (node.tOwned) {
    for (i = node.tOwned.length - 1; i >= 0; i--) cleanNode(node.tOwned[i]);
    delete node.tOwned;
  }
  if (node.owned) {
    for (i = node.owned.length - 1; i >= 0; i--) cleanNode(node.owned[i]);
    node.owned = null;
  }
  if (node.cleanups) {
    for (i = node.cleanups.length - 1; i >= 0; i--) node.cleanups[i]();
    node.cleanups = null;
  }
  node.state = 0;
}
function castError(err) {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : "Unknown error", {
    cause: err
  });
}
function handleError(err, owner = Owner) {
  const error = castError(err);
  throw error;
}
function resolveChildren(children) {
  if (typeof children === "function" && !children.length) return resolveChildren(children());
  if (Array.isArray(children)) {
    const results = [];
    for (let i = 0; i < children.length; i++) {
      const result = resolveChildren(children[i]);
      Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
    }
    return results;
  }
  return children;
}
function createProvider(id, options) {
  return function provider(props) {
    let res;
    createRenderEffect(() => res = untrack(() => {
      Owner.context = {
        ...Owner.context,
        [id]: props.value
      };
      return children(() => props.children);
    }), undefined);
    return res;
  };
}

const FALLBACK = Symbol("fallback");
function dispose(d) {
  for (let i = 0; i < d.length; i++) d[i]();
}
function mapArray(list, mapFn, options = {}) {
  let items = [],
    mapped = [],
    disposers = [],
    len = 0,
    indexes = mapFn.length > 1 ? [] : null;
  onCleanup(() => dispose(disposers));
  return () => {
    let newItems = list() || [],
      newLen = newItems.length,
      i,
      j;
    newItems[$TRACK];
    return untrack(() => {
      let newIndices, newIndicesNext, temp, tempdisposers, tempIndexes, start, end, newEnd, item;
      if (newLen === 0) {
        if (len !== 0) {
          dispose(disposers);
          disposers = [];
          items = [];
          mapped = [];
          len = 0;
          indexes && (indexes = []);
        }
        if (options.fallback) {
          items = [FALLBACK];
          mapped[0] = createRoot(disposer => {
            disposers[0] = disposer;
            return options.fallback();
          });
          len = 1;
        }
      }
      else if (len === 0) {
        mapped = new Array(newLen);
        for (j = 0; j < newLen; j++) {
          items[j] = newItems[j];
          mapped[j] = createRoot(mapper);
        }
        len = newLen;
      } else {
        temp = new Array(newLen);
        tempdisposers = new Array(newLen);
        indexes && (tempIndexes = new Array(newLen));
        for (start = 0, end = Math.min(len, newLen); start < end && items[start] === newItems[start]; start++);
        for (end = len - 1, newEnd = newLen - 1; end >= start && newEnd >= start && items[end] === newItems[newEnd]; end--, newEnd--) {
          temp[newEnd] = mapped[end];
          tempdisposers[newEnd] = disposers[end];
          indexes && (tempIndexes[newEnd] = indexes[end]);
        }
        newIndices = new Map();
        newIndicesNext = new Array(newEnd + 1);
        for (j = newEnd; j >= start; j--) {
          item = newItems[j];
          i = newIndices.get(item);
          newIndicesNext[j] = i === undefined ? -1 : i;
          newIndices.set(item, j);
        }
        for (i = start; i <= end; i++) {
          item = items[i];
          j = newIndices.get(item);
          if (j !== undefined && j !== -1) {
            temp[j] = mapped[i];
            tempdisposers[j] = disposers[i];
            indexes && (tempIndexes[j] = indexes[i]);
            j = newIndicesNext[j];
            newIndices.set(item, j);
          } else disposers[i]();
        }
        for (j = start; j < newLen; j++) {
          if (j in temp) {
            mapped[j] = temp[j];
            disposers[j] = tempdisposers[j];
            if (indexes) {
              indexes[j] = tempIndexes[j];
              indexes[j](j);
            }
          } else mapped[j] = createRoot(mapper);
        }
        mapped = mapped.slice(0, len = newLen);
        items = newItems.slice(0);
      }
      return mapped;
    });
    function mapper(disposer) {
      disposers[j] = disposer;
      if (indexes) {
        const [s, set] = createSignal(j);
        indexes[j] = set;
        return mapFn(newItems[j], s);
      }
      return mapFn(newItems[j]);
    }
  };
}
function indexArray(list, mapFn, options = {}) {
  let items = [],
    mapped = [],
    disposers = [],
    signals = [],
    len = 0,
    i;
  onCleanup(() => dispose(disposers));
  return () => {
    const newItems = list() || [],
      newLen = newItems.length;
    newItems[$TRACK];
    return untrack(() => {
      if (newLen === 0) {
        if (len !== 0) {
          dispose(disposers);
          disposers = [];
          items = [];
          mapped = [];
          len = 0;
          signals = [];
        }
        if (options.fallback) {
          items = [FALLBACK];
          mapped[0] = createRoot(disposer => {
            disposers[0] = disposer;
            return options.fallback();
          });
          len = 1;
        }
        return mapped;
      }
      if (items[0] === FALLBACK) {
        disposers[0]();
        disposers = [];
        items = [];
        mapped = [];
        len = 0;
      }
      for (i = 0; i < newLen; i++) {
        if (i < items.length && items[i] !== newItems[i]) {
          signals[i](() => newItems[i]);
        } else if (i >= items.length) {
          mapped[i] = createRoot(mapper);
        }
      }
      for (; i < items.length; i++) {
        disposers[i]();
      }
      len = signals.length = disposers.length = newLen;
      items = newItems.slice(0);
      return mapped = mapped.slice(0, len);
    });
    function mapper(disposer) {
      disposers[i] = disposer;
      const [s, set] = createSignal(newItems[i]);
      signals[i] = set;
      return mapFn(s, i);
    }
  };
}
function createComponent(Comp, props) {
  return untrack(() => Comp(props || {}));
}
function trueFn() {
  return true;
}
const propTraps = {
  get(_, property, receiver) {
    if (property === $PROXY) return receiver;
    return _.get(property);
  },
  has(_, property) {
    if (property === $PROXY) return true;
    return _.has(property);
  },
  set: trueFn,
  deleteProperty: trueFn,
  getOwnPropertyDescriptor(_, property) {
    return {
      configurable: true,
      enumerable: true,
      get() {
        return _.get(property);
      },
      set: trueFn,
      deleteProperty: trueFn
    };
  },
  ownKeys(_) {
    return _.keys();
  }
};
function resolveSource(s) {
  return !(s = typeof s === "function" ? s() : s) ? {} : s;
}
function resolveSources() {
  for (let i = 0, length = this.length; i < length; ++i) {
    const v = this[i]();
    if (v !== undefined) return v;
  }
}
function mergeProps(...sources) {
  let proxy = false;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    proxy = proxy || !!s && $PROXY in s;
    sources[i] = typeof s === "function" ? (proxy = true, createMemo(s)) : s;
  }
  if (SUPPORTS_PROXY && proxy) {
    return new Proxy({
      get(property) {
        for (let i = sources.length - 1; i >= 0; i--) {
          const v = resolveSource(sources[i])[property];
          if (v !== undefined) return v;
        }
      },
      has(property) {
        for (let i = sources.length - 1; i >= 0; i--) {
          if (property in resolveSource(sources[i])) return true;
        }
        return false;
      },
      keys() {
        const keys = [];
        for (let i = 0; i < sources.length; i++) keys.push(...Object.keys(resolveSource(sources[i])));
        return [...new Set(keys)];
      }
    }, propTraps);
  }
  const sourcesMap = {};
  const defined = Object.create(null);
  for (let i = sources.length - 1; i >= 0; i--) {
    const source = sources[i];
    if (!source) continue;
    const sourceKeys = Object.getOwnPropertyNames(source);
    for (let i = sourceKeys.length - 1; i >= 0; i--) {
      const key = sourceKeys[i];
      if (key === "__proto__" || key === "constructor") continue;
      const desc = Object.getOwnPropertyDescriptor(source, key);
      if (!defined[key]) {
        defined[key] = desc.get ? {
          enumerable: true,
          configurable: true,
          get: resolveSources.bind(sourcesMap[key] = [desc.get.bind(source)])
        } : desc.value !== undefined ? desc : undefined;
      } else {
        const sources = sourcesMap[key];
        if (sources) {
          if (desc.get) sources.push(desc.get.bind(source));else if (desc.value !== undefined) sources.push(() => desc.value);
        }
      }
    }
  }
  const target = {};
  const definedKeys = Object.keys(defined);
  for (let i = definedKeys.length - 1; i >= 0; i--) {
    const key = definedKeys[i],
      desc = defined[key];
    if (desc && desc.get) Object.defineProperty(target, key, desc);else target[key] = desc ? desc.value : undefined;
  }
  return target;
}
function splitProps(props, ...keys) {
  if (SUPPORTS_PROXY && $PROXY in props) {
    const blocked = new Set(keys.length > 1 ? keys.flat() : keys[0]);
    const res = keys.map(k => {
      return new Proxy({
        get(property) {
          return k.includes(property) ? props[property] : undefined;
        },
        has(property) {
          return k.includes(property) && property in props;
        },
        keys() {
          return k.filter(property => property in props);
        }
      }, propTraps);
    });
    res.push(new Proxy({
      get(property) {
        return blocked.has(property) ? undefined : props[property];
      },
      has(property) {
        return blocked.has(property) ? false : property in props;
      },
      keys() {
        return Object.keys(props).filter(k => !blocked.has(k));
      }
    }, propTraps));
    return res;
  }
  const otherObject = {};
  const objects = keys.map(() => ({}));
  for (const propName of Object.getOwnPropertyNames(props)) {
    const desc = Object.getOwnPropertyDescriptor(props, propName);
    const isDefaultDesc = !desc.get && !desc.set && desc.enumerable && desc.writable && desc.configurable;
    let blocked = false;
    let objectIndex = 0;
    for (const k of keys) {
      if (k.includes(propName)) {
        blocked = true;
        isDefaultDesc ? objects[objectIndex][propName] = desc.value : Object.defineProperty(objects[objectIndex], propName, desc);
      }
      ++objectIndex;
    }
    if (!blocked) {
      isDefaultDesc ? otherObject[propName] = desc.value : Object.defineProperty(otherObject, propName, desc);
    }
  }
  return [...objects, otherObject];
}

const narrowedError = name => `Stale read from <${name}>.`;
function For(props) {
  const fallback = "fallback" in props && {
    fallback: () => props.fallback
  };
  return createMemo(mapArray(() => props.each, props.children, fallback || undefined));
}
function Index(props) {
  const fallback = "fallback" in props && {
    fallback: () => props.fallback
  };
  return createMemo(indexArray(() => props.each, props.children, fallback || undefined));
}
function Show(props) {
  const keyed = props.keyed;
  const conditionValue = createMemo(() => props.when, undefined, undefined);
  const condition = keyed ? conditionValue : createMemo(conditionValue, undefined, {
    equals: (a, b) => !a === !b
  });
  return createMemo(() => {
    const c = condition();
    if (c) {
      const child = props.children;
      const fn = typeof child === "function" && child.length > 0;
      return fn ? untrack(() => child(keyed ? c : () => {
        if (!untrack(condition)) throw narrowedError("Show");
        return conditionValue();
      })) : child;
    }
    return props.fallback;
  }, undefined, undefined);
}
function Switch(props) {
  const chs = children(() => props.children);
  const switchFunc = createMemo(() => {
    const ch = chs();
    const mps = Array.isArray(ch) ? ch : [ch];
    let func = () => undefined;
    for (let i = 0; i < mps.length; i++) {
      const index = i;
      const mp = mps[i];
      const prevFunc = func;
      const conditionValue = createMemo(() => prevFunc() ? undefined : mp.when, undefined, undefined);
      const condition = mp.keyed ? conditionValue : createMemo(conditionValue, undefined, {
        equals: (a, b) => !a === !b
      });
      func = () => prevFunc() || (condition() ? [index, conditionValue, mp] : undefined);
    }
    return func;
  });
  return createMemo(() => {
    const sel = switchFunc()();
    if (!sel) return props.fallback;
    const [index, conditionValue, mp] = sel;
    const child = mp.children;
    const fn = typeof child === "function" && child.length > 0;
    return fn ? untrack(() => child(mp.keyed ? conditionValue() : () => {
      if (untrack(switchFunc)()?.[0] !== index) throw narrowedError("Match");
      return conditionValue();
    })) : child;
  }, undefined, undefined);
}
function Match(props) {
  return props;
}

const booleans = ["allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "disabled", "formnovalidate", "hidden", "indeterminate", "inert", "ismap", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline", "readonly", "required", "reversed", "seamless", "selected"];
const Properties = /*#__PURE__*/new Set(["className", "value", "readOnly", "noValidate", "formNoValidate", "isMap", "noModule", "playsInline", ...booleans]);
const ChildProperties = /*#__PURE__*/new Set(["innerHTML", "textContent", "innerText", "children"]);
const Aliases = /*#__PURE__*/Object.assign(Object.create(null), {
  className: "class",
  htmlFor: "for"
});
const PropAliases = /*#__PURE__*/Object.assign(Object.create(null), {
  class: "className",
  novalidate: {
    $: "noValidate",
    FORM: 1
  },
  formnovalidate: {
    $: "formNoValidate",
    BUTTON: 1,
    INPUT: 1
  },
  ismap: {
    $: "isMap",
    IMG: 1
  },
  nomodule: {
    $: "noModule",
    SCRIPT: 1
  },
  playsinline: {
    $: "playsInline",
    VIDEO: 1
  },
  readonly: {
    $: "readOnly",
    INPUT: 1,
    TEXTAREA: 1
  }
});
function getPropAlias(prop, tagName) {
  const a = PropAliases[prop];
  return typeof a === "object" ? a[tagName] ? a["$"] : undefined : a;
}
const DelegatedEvents = /*#__PURE__*/new Set(["beforeinput", "click", "dblclick", "contextmenu", "focusin", "focusout", "input", "keydown", "keyup", "mousedown", "mousemove", "mouseout", "mouseover", "mouseup", "pointerdown", "pointermove", "pointerout", "pointerover", "pointerup", "touchend", "touchmove", "touchstart"]);
const SVGNamespace = {
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace"
};

const memo = fn => createMemo(() => fn());

function reconcileArrays(parentNode, a, b) {
  let bLength = b.length,
    aEnd = a.length,
    bEnd = bLength,
    aStart = 0,
    bStart = 0,
    after = a[aEnd - 1].nextSibling,
    map = null;
  while (aStart < aEnd || bStart < bEnd) {
    if (a[aStart] === b[bStart]) {
      aStart++;
      bStart++;
      continue;
    }
    while (a[aEnd - 1] === b[bEnd - 1]) {
      aEnd--;
      bEnd--;
    }
    if (aEnd === aStart) {
      const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
      while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
    } else if (bEnd === bStart) {
      while (aStart < aEnd) {
        if (!map || !map.has(a[aStart])) a[aStart].remove();
        aStart++;
      }
    } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
      const node = a[--aEnd].nextSibling;
      parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
      parentNode.insertBefore(b[--bEnd], node);
      a[aEnd] = b[bEnd];
    } else {
      if (!map) {
        map = new Map();
        let i = bStart;
        while (i < bEnd) map.set(b[i], i++);
      }
      const index = map.get(a[aStart]);
      if (index != null) {
        if (bStart < index && index < bEnd) {
          let i = aStart,
            sequence = 1,
            t;
          while (++i < aEnd && i < bEnd) {
            if ((t = map.get(a[i])) == null || t !== index + sequence) break;
            sequence++;
          }
          if (sequence > index - bStart) {
            const node = a[aStart];
            while (bStart < index) parentNode.insertBefore(b[bStart++], node);
          } else parentNode.replaceChild(b[bStart++], a[aStart++]);
        } else aStart++;
      } else a[aStart++].remove();
    }
  }
}

const $$EVENTS = "_$DX_DELEGATE";
function render(code, element, init, options = {}) {
  let disposer;
  createRoot(dispose => {
    disposer = dispose;
    element === document ? code() : insert(element, code(), element.firstChild ? null : undefined, init);
  }, options.owner);
  return () => {
    disposer();
    element.textContent = "";
  };
}
function template(html, isImportNode, isSVG, isMathML) {
  let node;
  const create = () => {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content.firstChild;
  };
  const fn = () => (node || (node = create())).cloneNode(true);
  fn.cloneNode = fn;
  return fn;
}
function delegateEvents(eventNames, document = window.document) {
  const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
  for (let i = 0, l = eventNames.length; i < l; i++) {
    const name = eventNames[i];
    if (!e.has(name)) {
      e.add(name);
      document.addEventListener(name, eventHandler);
    }
  }
}
function setAttribute(node, name, value) {
  if (value == null) node.removeAttribute(name);else node.setAttribute(name, value);
}
function setAttributeNS(node, namespace, name, value) {
  if (value == null) node.removeAttributeNS(namespace, name);else node.setAttributeNS(namespace, name, value);
}
function setBoolAttribute(node, name, value) {
  value ? node.setAttribute(name, "") : node.removeAttribute(name);
}
function className(node, value) {
  if (value == null) node.removeAttribute("class");else node.className = value;
}
function addEventListener(node, name, handler, delegate) {
  if (delegate) {
    if (Array.isArray(handler)) {
      node[`$$${name}`] = handler[0];
      node[`$$${name}Data`] = handler[1];
    } else node[`$$${name}`] = handler;
  } else if (Array.isArray(handler)) {
    const handlerFn = handler[0];
    node.addEventListener(name, handler[0] = e => handlerFn.call(node, handler[1], e));
  } else node.addEventListener(name, handler, typeof handler !== "function" && handler);
}
function classList(node, value, prev = {}) {
  const classKeys = Object.keys(value || {}),
    prevKeys = Object.keys(prev);
  let i, len;
  for (i = 0, len = prevKeys.length; i < len; i++) {
    const key = prevKeys[i];
    if (!key || key === "undefined" || value[key]) continue;
    toggleClassKey(node, key, false);
    delete prev[key];
  }
  for (i = 0, len = classKeys.length; i < len; i++) {
    const key = classKeys[i],
      classValue = !!value[key];
    if (!key || key === "undefined" || prev[key] === classValue || !classValue) continue;
    toggleClassKey(node, key, true);
    prev[key] = classValue;
  }
  return prev;
}
function style(node, value, prev) {
  if (!value) return prev ? setAttribute(node, "style") : value;
  const nodeStyle = node.style;
  if (typeof value === "string") return nodeStyle.cssText = value;
  typeof prev === "string" && (nodeStyle.cssText = prev = undefined);
  prev || (prev = {});
  value || (value = {});
  let v, s;
  for (s in prev) {
    value[s] == null && nodeStyle.removeProperty(s);
    delete prev[s];
  }
  for (s in value) {
    v = value[s];
    if (v !== prev[s]) {
      nodeStyle.setProperty(s, v);
      prev[s] = v;
    }
  }
  return prev;
}
function spread(node, props = {}, isSVG, skipChildren) {
  const prevProps = {};
  if (!skipChildren) {
    createRenderEffect(() => prevProps.children = insertExpression(node, props.children, prevProps.children));
  }
  createRenderEffect(() => typeof props.ref === "function" && use(props.ref, node));
  createRenderEffect(() => assign(node, props, isSVG, true, prevProps, true));
  return prevProps;
}
function use(fn, element, arg) {
  return untrack(() => fn(element, arg));
}
function insert(parent, accessor, marker, initial) {
  if (marker !== undefined && !initial) initial = [];
  if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
  createRenderEffect(current => insertExpression(parent, accessor(), current, marker), initial);
}
function assign(node, props, isSVG, skipChildren, prevProps = {}, skipRef = false) {
  props || (props = {});
  for (const prop in prevProps) {
    if (!(prop in props)) {
      if (prop === "children") continue;
      prevProps[prop] = assignProp(node, prop, null, prevProps[prop], isSVG, skipRef, props);
    }
  }
  for (const prop in props) {
    if (prop === "children") {
      continue;
    }
    const value = props[prop];
    prevProps[prop] = assignProp(node, prop, value, prevProps[prop], isSVG, skipRef, props);
  }
}
function toPropertyName(name) {
  return name.toLowerCase().replace(/-([a-z])/g, (_, w) => w.toUpperCase());
}
function toggleClassKey(node, key, value) {
  const classNames = key.trim().split(/\s+/);
  for (let i = 0, nameLen = classNames.length; i < nameLen; i++) node.classList.toggle(classNames[i], value);
}
function assignProp(node, prop, value, prev, isSVG, skipRef, props) {
  let isCE, isProp, isChildProp, propAlias, forceProp;
  if (prop === "style") return style(node, value, prev);
  if (prop === "classList") return classList(node, value, prev);
  if (value === prev) return prev;
  if (prop === "ref") {
    if (!skipRef) value(node);
  } else if (prop.slice(0, 3) === "on:") {
    const e = prop.slice(3);
    prev && node.removeEventListener(e, prev, typeof prev !== "function" && prev);
    value && node.addEventListener(e, value, typeof value !== "function" && value);
  } else if (prop.slice(0, 10) === "oncapture:") {
    const e = prop.slice(10);
    prev && node.removeEventListener(e, prev, true);
    value && node.addEventListener(e, value, true);
  } else if (prop.slice(0, 2) === "on") {
    const name = prop.slice(2).toLowerCase();
    const delegate = DelegatedEvents.has(name);
    if (!delegate && prev) {
      const h = Array.isArray(prev) ? prev[0] : prev;
      node.removeEventListener(name, h);
    }
    if (delegate || value) {
      addEventListener(node, name, value, delegate);
      delegate && delegateEvents([name]);
    }
  } else if (prop.slice(0, 5) === "attr:") {
    setAttribute(node, prop.slice(5), value);
  } else if (prop.slice(0, 5) === "bool:") {
    setBoolAttribute(node, prop.slice(5), value);
  } else if ((forceProp = prop.slice(0, 5) === "prop:") || (isChildProp = ChildProperties.has(prop)) || !isSVG && ((propAlias = getPropAlias(prop, node.tagName)) || (isProp = Properties.has(prop))) || (isCE = node.nodeName.includes("-") || "is" in props)) {
    if (forceProp) {
      prop = prop.slice(5);
      isProp = true;
    }
    if (prop === "class" || prop === "className") className(node, value);else if (isCE && !isProp && !isChildProp) node[toPropertyName(prop)] = value;else node[propAlias || prop] = value;
  } else {
    const ns = isSVG && prop.indexOf(":") > -1 && SVGNamespace[prop.split(":")[0]];
    if (ns) setAttributeNS(node, ns, prop, value);else setAttribute(node, Aliases[prop] || prop, value);
  }
  return value;
}
function eventHandler(e) {
  let node = e.target;
  const key = `$$${e.type}`;
  const oriTarget = e.target;
  const oriCurrentTarget = e.currentTarget;
  const retarget = value => Object.defineProperty(e, "target", {
    configurable: true,
    value
  });
  const handleNode = () => {
    const handler = node[key];
    if (handler && !node.disabled) {
      const data = node[`${key}Data`];
      data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
      if (e.cancelBubble) return;
    }
    node.host && typeof node.host !== "string" && !node.host._$host && node.contains(e.target) && retarget(node.host);
    return true;
  };
  const walkUpTree = () => {
    while (handleNode() && (node = node._$host || node.parentNode || node.host));
  };
  Object.defineProperty(e, "currentTarget", {
    configurable: true,
    get() {
      return node || document;
    }
  });
  if (e.composedPath) {
    const path = e.composedPath();
    retarget(path[0]);
    for (let i = 0; i < path.length - 2; i++) {
      node = path[i];
      if (!handleNode()) break;
      if (node._$host) {
        node = node._$host;
        walkUpTree();
        break;
      }
      if (node.parentNode === oriCurrentTarget) {
        break;
      }
    }
  }
  else walkUpTree();
  retarget(oriTarget);
}
function insertExpression(parent, value, current, marker, unwrapArray) {
  while (typeof current === "function") current = current();
  if (value === current) return current;
  const t = typeof value,
    multi = marker !== undefined;
  parent = multi && current[0] && current[0].parentNode || parent;
  if (t === "string" || t === "number") {
    if (t === "number") {
      value = value.toString();
      if (value === current) return current;
    }
    if (multi) {
      let node = current[0];
      if (node && node.nodeType === 3) {
        node.data !== value && (node.data = value);
      } else node = document.createTextNode(value);
      current = cleanChildren(parent, current, marker, node);
    } else {
      if (current !== "" && typeof current === "string") {
        current = parent.firstChild.data = value;
      } else current = parent.textContent = value;
    }
  } else if (value == null || t === "boolean") {
    current = cleanChildren(parent, current, marker);
  } else if (t === "function") {
    createRenderEffect(() => {
      let v = value();
      while (typeof v === "function") v = v();
      current = insertExpression(parent, v, current, marker);
    });
    return () => current;
  } else if (Array.isArray(value)) {
    const array = [];
    const currentArray = current && Array.isArray(current);
    if (normalizeIncomingArray(array, value, current, unwrapArray)) {
      createRenderEffect(() => current = insertExpression(parent, array, current, marker, true));
      return () => current;
    }
    if (array.length === 0) {
      current = cleanChildren(parent, current, marker);
      if (multi) return current;
    } else if (currentArray) {
      if (current.length === 0) {
        appendNodes(parent, array, marker);
      } else reconcileArrays(parent, current, array);
    } else {
      current && cleanChildren(parent);
      appendNodes(parent, array);
    }
    current = array;
  } else if (value.nodeType) {
    if (Array.isArray(current)) {
      if (multi) return current = cleanChildren(parent, current, marker, value);
      cleanChildren(parent, current, null, value);
    } else if (current == null || current === "" || !parent.firstChild) {
      parent.appendChild(value);
    } else parent.replaceChild(value, parent.firstChild);
    current = value;
  } else ;
  return current;
}
function normalizeIncomingArray(normalized, array, current, unwrap) {
  let dynamic = false;
  for (let i = 0, len = array.length; i < len; i++) {
    let item = array[i],
      prev = current && current[normalized.length],
      t;
    if (item == null || item === true || item === false) ; else if ((t = typeof item) === "object" && item.nodeType) {
      normalized.push(item);
    } else if (Array.isArray(item)) {
      dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
    } else if (t === "function") {
      if (unwrap) {
        while (typeof item === "function") item = item();
        dynamic = normalizeIncomingArray(normalized, Array.isArray(item) ? item : [item], Array.isArray(prev) ? prev : [prev]) || dynamic;
      } else {
        normalized.push(item);
        dynamic = true;
      }
    } else {
      const value = String(item);
      if (prev && prev.nodeType === 3 && prev.data === value) normalized.push(prev);else normalized.push(document.createTextNode(value));
    }
  }
  return dynamic;
}
function appendNodes(parent, array, marker = null) {
  for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
}
function cleanChildren(parent, current, marker, replacement) {
  if (marker === undefined) return parent.textContent = "";
  const node = replacement || document.createTextNode("");
  if (current.length) {
    let inserted = false;
    for (let i = current.length - 1; i >= 0; i--) {
      const el = current[i];
      if (node !== el) {
        const isParent = el.parentNode === parent;
        if (!inserted && !i) isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);else isParent && el.remove();
      } else inserted = true;
    }
  } else parent.insertBefore(node, marker);
  return [node];
}
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
function createElement(tagName, isSVG = false) {
  return isSVG ? document.createElementNS(SVG_NAMESPACE, tagName) : document.createElement(tagName);
}
function Portal(props) {
  const {
      useShadow
    } = props,
    marker = document.createTextNode(""),
    mount = () => props.mount || document.body,
    owner = getOwner();
  let content;
  createEffect(() => {
    content || (content = runWithOwner(owner, () => createMemo(() => props.children)));
    const el = mount();
    if (el instanceof HTMLHeadElement) {
      const [clean, setClean] = createSignal(false);
      const cleanup = () => setClean(true);
      createRoot(dispose => insert(el, () => !clean() ? content() : dispose(), null));
      onCleanup(cleanup);
    } else {
      const container = createElement(props.isSVG ? "g" : "div", props.isSVG),
        renderRoot = useShadow && container.attachShadow ? container.attachShadow({
          mode: "open"
        }) : container;
      Object.defineProperty(container, "_$host", {
        get() {
          return marker.parentNode;
        },
        configurable: true
      });
      insert(renderRoot, content);
      el.appendChild(container);
      props.ref && props.ref(container);
      onCleanup(() => el.removeChild(container));
    }
  }, undefined, {
    render: true
  });
  return marker;
}

const $RAW = Symbol("store-raw"),
  $NODE = Symbol("store-node"),
  $HAS = Symbol("store-has"),
  $SELF = Symbol("store-self");
function wrap$1(value) {
  let p = value[$PROXY];
  if (!p) {
    Object.defineProperty(value, $PROXY, {
      value: p = new Proxy(value, proxyTraps$1)
    });
    if (!Array.isArray(value)) {
      const keys = Object.keys(value),
        desc = Object.getOwnPropertyDescriptors(value);
      for (let i = 0, l = keys.length; i < l; i++) {
        const prop = keys[i];
        if (desc[prop].get) {
          Object.defineProperty(value, prop, {
            enumerable: desc[prop].enumerable,
            get: desc[prop].get.bind(p)
          });
        }
      }
    }
  }
  return p;
}
function isWrappable(obj) {
  let proto;
  return obj != null && typeof obj === "object" && (obj[$PROXY] || !(proto = Object.getPrototypeOf(obj)) || proto === Object.prototype || Array.isArray(obj));
}
function unwrap(item, set = new Set()) {
  let result, unwrapped, v, prop;
  if (result = item != null && item[$RAW]) return result;
  if (!isWrappable(item) || set.has(item)) return item;
  if (Array.isArray(item)) {
    if (Object.isFrozen(item)) item = item.slice(0);else set.add(item);
    for (let i = 0, l = item.length; i < l; i++) {
      v = item[i];
      if ((unwrapped = unwrap(v, set)) !== v) item[i] = unwrapped;
    }
  } else {
    if (Object.isFrozen(item)) item = Object.assign({}, item);else set.add(item);
    const keys = Object.keys(item),
      desc = Object.getOwnPropertyDescriptors(item);
    for (let i = 0, l = keys.length; i < l; i++) {
      prop = keys[i];
      if (desc[prop].get) continue;
      v = item[prop];
      if ((unwrapped = unwrap(v, set)) !== v) item[prop] = unwrapped;
    }
  }
  return item;
}
function getNodes(target, symbol) {
  let nodes = target[symbol];
  if (!nodes) Object.defineProperty(target, symbol, {
    value: nodes = Object.create(null)
  });
  return nodes;
}
function getNode(nodes, property, value) {
  if (nodes[property]) return nodes[property];
  const [s, set] = createSignal(value, {
    equals: false,
    internal: true
  });
  s.$ = set;
  return nodes[property] = s;
}
function proxyDescriptor$1(target, property) {
  const desc = Reflect.getOwnPropertyDescriptor(target, property);
  if (!desc || desc.get || !desc.configurable || property === $PROXY || property === $NODE) return desc;
  delete desc.value;
  delete desc.writable;
  desc.get = () => target[$PROXY][property];
  return desc;
}
function trackSelf(target) {
  getListener() && getNode(getNodes(target, $NODE), $SELF)();
}
function ownKeys(target) {
  trackSelf(target);
  return Reflect.ownKeys(target);
}
const proxyTraps$1 = {
  get(target, property, receiver) {
    if (property === $RAW) return target;
    if (property === $PROXY) return receiver;
    if (property === $TRACK) {
      trackSelf(target);
      return receiver;
    }
    const nodes = getNodes(target, $NODE);
    const tracked = nodes[property];
    let value = tracked ? tracked() : target[property];
    if (property === $NODE || property === $HAS || property === "__proto__") return value;
    if (!tracked) {
      const desc = Object.getOwnPropertyDescriptor(target, property);
      if (getListener() && (typeof value !== "function" || target.hasOwnProperty(property)) && !(desc && desc.get)) value = getNode(nodes, property, value)();
    }
    return isWrappable(value) ? wrap$1(value) : value;
  },
  has(target, property) {
    if (property === $RAW || property === $PROXY || property === $TRACK || property === $NODE || property === $HAS || property === "__proto__") return true;
    getListener() && getNode(getNodes(target, $HAS), property)();
    return property in target;
  },
  set() {
    return true;
  },
  deleteProperty() {
    return true;
  },
  ownKeys: ownKeys,
  getOwnPropertyDescriptor: proxyDescriptor$1
};
function setProperty(state, property, value, deleting = false) {
  if (!deleting && state[property] === value) return;
  const prev = state[property],
    len = state.length;
  if (value === undefined) {
    delete state[property];
    if (state[$HAS] && state[$HAS][property] && prev !== undefined) state[$HAS][property].$();
  } else {
    state[property] = value;
    if (state[$HAS] && state[$HAS][property] && prev === undefined) state[$HAS][property].$();
  }
  let nodes = getNodes(state, $NODE),
    node;
  if (node = getNode(nodes, property, prev)) node.$(() => value);
  if (Array.isArray(state) && state.length !== len) {
    for (let i = state.length; i < len; i++) (node = nodes[i]) && node.$();
    (node = getNode(nodes, "length", len)) && node.$(state.length);
  }
  (node = nodes[$SELF]) && node.$();
}
function mergeStoreNode(state, value) {
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    setProperty(state, key, value[key]);
  }
}
function updateArray(current, next) {
  if (typeof next === "function") next = next(current);
  next = unwrap(next);
  if (Array.isArray(next)) {
    if (current === next) return;
    let i = 0,
      len = next.length;
    for (; i < len; i++) {
      const value = next[i];
      if (current[i] !== value) setProperty(current, i, value);
    }
    setProperty(current, "length", len);
  } else mergeStoreNode(current, next);
}
function updatePath(current, path, traversed = []) {
  let part,
    prev = current;
  if (path.length > 1) {
    part = path.shift();
    const partType = typeof part,
      isArray = Array.isArray(current);
    if (Array.isArray(part)) {
      for (let i = 0; i < part.length; i++) {
        updatePath(current, [part[i]].concat(path), traversed);
      }
      return;
    } else if (isArray && partType === "function") {
      for (let i = 0; i < current.length; i++) {
        if (part(current[i], i)) updatePath(current, [i].concat(path), traversed);
      }
      return;
    } else if (isArray && partType === "object") {
      const {
        from = 0,
        to = current.length - 1,
        by = 1
      } = part;
      for (let i = from; i <= to; i += by) {
        updatePath(current, [i].concat(path), traversed);
      }
      return;
    } else if (path.length > 1) {
      updatePath(current[part], path, [part].concat(traversed));
      return;
    }
    prev = current[part];
    traversed = [part].concat(traversed);
  }
  let value = path[0];
  if (typeof value === "function") {
    value = value(prev, traversed);
    if (value === prev) return;
  }
  if (part === undefined && value == undefined) return;
  value = unwrap(value);
  if (part === undefined || isWrappable(prev) && isWrappable(value) && !Array.isArray(value)) {
    mergeStoreNode(prev, value);
  } else setProperty(current, part, value);
}
function createStore(...[store, options]) {
  const unwrappedStore = unwrap(store || {});
  const isArray = Array.isArray(unwrappedStore);
  const wrappedStore = wrap$1(unwrappedStore);
  function setStore(...args) {
    batch(() => {
      isArray && args.length === 1 ? updateArray(unwrappedStore, args[0]) : updatePath(unwrappedStore, args);
    });
  }
  return [wrappedStore, setStore];
}

var _tmpl$$p = /* @__PURE__ */template(`<svg>`),
  _tmpl$2$i = /* @__PURE__ */template(`<div>`);
const [SVG_DOC] = createResource(async () => await fetch("./svg-defs.svg").then(resp => resp.text().then(svg_file_text => {
  let parser = new DOMParser();
  return parser.parseFromString(svg_file_text, "text/html");
})));
const DEFAULT_PROPS = {
  icon: "close_small",
  hover: true,
  active: void 0,
  selected: void 0,
  force_reload: false,
  when: void 0
};
function Icon(props) {
  let icon_el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const merged = mergeProps(DEFAULT_PROPS, props);
  merged.classList = {
    icon: merged.hover,
    icon_no_hover: !merged.hover,
    ...merged.classList
  };
  const [iconProps, svgProps] = splitProps(merged, ["icon", "hover", "active", "selected", "force_reload", "when"]);
  let propKeys = Object.keys({
    ...svgProps,
    "class": "",
    "active": "",
    "selected": ""
  });
  function update() {
    let svg_ref = SVG_DOC()?.querySelector(`#${iconProps.icon}`);
    if (svg_ref) {
      svg_ref = svg_ref.cloneNode(true);
      icon_el.replaceChildren(...Array.from(svg_ref.children));
      let static_keys = 0;
      while (icon_el.attributes.length > static_keys) if (propKeys.includes(icon_el.attributes[static_keys].name)) static_keys += 1;else icon_el.removeAttribute(icon_el.attributes[static_keys].name);
      let attrs = svg_ref.attributes;
      for (let i = 0; i < attrs.length; i++) if (!propKeys.includes(attrs[i].name)) icon_el.setAttribute(attrs[i].name, attrs[i].value);
    }
  }
  createEffect(update);
  if (props.force_reload || iconProps.when) setTimeout(update, 50);
  if (iconProps.when) {
    createEffect(on$1(iconProps.when, update));
    return createComponent(Show, {
      get when() {
        return iconProps.when();
      },
      get children() {
        var _el$ = _tmpl$$p();
        var _ref$ = icon_el;
        typeof _ref$ === "function" ? use(_ref$, _el$) : icon_el = _el$;
        spread(_el$, svgProps, true, false);
        createRenderEffect(_p$ => {
          var _v$ = iconProps.active ? "" : void 0,
            _v$2 = iconProps.selected ? "" : void 0;
          _v$ !== _p$.e && setAttribute(_el$, "active", _p$.e = _v$);
          _v$2 !== _p$.t && setAttribute(_el$, "selected", _p$.t = _v$2);
          return _p$;
        }, {
          e: void 0,
          t: void 0
        });
        return _el$;
      }
    });
  } else return (() => {
    var _el$2 = _tmpl$$p();
    var _ref$2 = icon_el;
    typeof _ref$2 === "function" ? use(_ref$2, _el$2) : icon_el = _el$2;
    spread(_el$2, svgProps, true, false);
    createRenderEffect(_p$ => {
      var _v$3 = iconProps.active ? "" : void 0,
        _v$4 = iconProps.selected ? "" : void 0;
      _v$3 !== _p$.e && setAttribute(_el$2, "active", _p$.e = _v$3);
      _v$4 !== _p$.t && setAttribute(_el$2, "selected", _p$.t = _v$4);
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$2;
  })();
}
const DEFAULT_TEXT_PROPS = {
  text: "",
  activated: void 0
};
function TextIcon(props) {
  const merged = mergeProps(DEFAULT_TEXT_PROPS, props);
  merged.classList = mergeProps({
    icon_text: true
  }, props.classList);
  const [iconProps, divProps] = splitProps(merged, ["text", "activated", "when"]);
  if (iconProps.when) return createComponent(Show, {
    get when() {
      return iconProps.when();
    },
    get children() {
      var _el$3 = _tmpl$2$i();
      spread(_el$3, mergeProps(divProps, {
        get innerHTML() {
          return iconProps.text;
        }
      }), false, false);
      createRenderEffect(() => setAttribute(_el$3, "active", iconProps.activated ? "" : void 0));
      return _el$3;
    }
  });else return (() => {
    var _el$4 = _tmpl$2$i();
    spread(_el$4, mergeProps(divProps, {
      get innerHTML() {
        return iconProps.text;
      }
    }), false, false);
    createRenderEffect(() => setAttribute(_el$4, "active", iconProps.activated ? "" : void 0));
    return _el$4;
  })();
}
var icons = /* @__PURE__ */(icons2 => {
  icons2["blank"] = "blank";
  icons2["menu"] = "menu";
  icons2["menu_add"] = "menu_add";
  icons2["menu_ext"] = "menu_ext";
  icons2["menu_ext_small"] = "menu_ext_small";
  icons2["menu_search"] = "menu_search";
  icons2["menu_arrow_we"] = "menu_arrow_we";
  icons2["menu_arrow_ew"] = "menu_arrow_ew";
  icons2["menu_arrow_ns"] = "menu_arrow_ns";
  icons2["menu_arrow_sn"] = "menu_arrow_sn";
  icons2["menu_arrow_up_down"] = "menu_arrow_up_down";
  icons2["menu_dragable"] = "menu_dragable";
  icons2["panel_top"] = "panel_top";
  icons2["panel_left"] = "panel_left";
  icons2["panel_right"] = "panel_right";
  icons2["panel_bottom"] = "panel_bottom";
  icons2["cursor_cross"] = "cursor_cross";
  icons2["cursor_dot"] = "cursor_dot";
  icons2["cursor_arrow"] = "cursor_arrow";
  icons2["cursor_erase"] = "cursor_erase";
  icons2["candle_heiken_ashi"] = "candle_heiken_ashi";
  icons2["candle_regular"] = "candle_regular";
  icons2["candle_bar"] = "candle_bar";
  icons2["candle_hollow"] = "candle_hollow";
  icons2["candle_rounded"] = "candle_rounded";
  icons2["series_line"] = "series_line";
  icons2["series_line_markers"] = "series_line_markers";
  icons2["series_step_line"] = "series_step_line";
  icons2["series_area"] = "series_area";
  icons2["series_baseline"] = "series_baseline";
  icons2["series_histogram"] = "series_histogram";
  icons2["indicator"] = "indicator";
  icons2["indicator_template"] = "indicator_template";
  icons2["indicator_on_stratagy"] = "indicator_on_stratagy";
  icons2["eye_normal"] = "eye_normal";
  icons2["eye_crossed"] = "eye_crossed";
  icons2["eye_loading"] = "eye_loading";
  icons2["undo"] = "undo";
  icons2["redo"] = "redo";
  icons2["copy"] = "copy";
  icons2["edit"] = "edit";
  icons2["close"] = "close";
  icons2["settings"] = "settings";
  icons2["settings_small"] = "settings_small";
  icons2["settings_slider"] = "settings_slider";
  icons2["add_section"] = "add_section";
  icons2["maximize"] = "maximize";
  icons2["minimize"] = "minimize";
  icons2["restore"] = "restore";
  icons2["restore_alt"] = "restore_alt";
  icons2["window_add"] = "window_add";
  icons2["options_add"] = "options_add";
  icons2["options_remove"] = "options_remove";
  icons2["fib_retrace"] = "fib_retrace";
  icons2["fib_extend"] = "fib_extend";
  icons2["trend_line"] = "trend_line";
  icons2["trend_ray"] = "trend_ray";
  icons2["trend_extended"] = "trend_extended";
  icons2["horiz_line"] = "horiz_line";
  icons2["horiz_ray"] = "horiz_ray";
  icons2["vert_line"] = "vert_line";
  icons2["channel_parallel"] = "channel_parallel";
  icons2["channel_disjoint"] = "channel_disjoint";
  icons2["brush"] = "brush";
  icons2["polyline"] = "polyline";
  icons2["magnet"] = "magnet";
  icons2["magnet_strong"] = "magnet_strong";
  icons2["link"] = "link";
  icons2["unlink"] = "unlink";
  icons2["ruler"] = "ruler";
  icons2["trash"] = "trash";
  icons2["star"] = "star";
  icons2["star_filled"] = "star_filled";
  icons2["lock_locked"] = "lock_locked";
  icons2["lock_unlocked"] = "lock_unlocked";
  icons2["bar_pattern"] = "bar_pattern";
  icons2["vol_profile_fixed"] = "vol_profile_fixed";
  icons2["vol_profile_anchored"] = "vol_profile_anchored";
  icons2["range_price"] = "range_price";
  icons2["range_date"] = "range_date";
  icons2["range_price_date"] = "range_price_date";
  icons2["flame"] = "flame";
  icons2["rewind"] = "rewind";
  icons2["calendar"] = "calendar";
  icons2["calendar_to_date"] = "calendar_to_date";
  icons2["alert"] = "alert";
  icons2["alert_add"] = "alert_add";
  icons2["notification"] = "notification";
  icons2["notification_silence"] = "notification_silence";
  icons2["object_tree"] = "object_tree";
  icons2["data_window"] = "data_window";
  icons2["frame_editor"] = "frame_editor";
  icons2["box_fullscreen"] = "box_fullscreen";
  icons2["layout_single"] = "layout_single";
  icons2["layout_double_vert"] = "layout_double_vert";
  icons2["layout_double_horiz"] = "layout_double_horiz";
  icons2["layout_triple_horiz"] = "layout_triple_horiz";
  icons2["layout_triple_top"] = "layout_triple_top";
  icons2["layout_triple_vert"] = "layout_triple_vert";
  icons2["layout_triple_left"] = "layout_triple_left";
  icons2["layout_triple_right"] = "layout_triple_right";
  icons2["layout_triple_bottom"] = "layout_triple_bottom";
  icons2["layout_quad_sq_v"] = "layout_quad_v";
  icons2["layout_quad_sq_h"] = "layout_quad_h";
  icons2["layout_quad_vert"] = "layout_quad_vert";
  icons2["layout_quad_horiz"] = "layout_quad_horiz";
  icons2["layout_quad_top"] = "layout_quad_top";
  icons2["layout_quad_left"] = "layout_quad_left";
  icons2["layout_quad_right"] = "layout_quad_right";
  icons2["layout_quad_bottom"] = "layout_quad_bottom";
  return icons2;
})(icons || {});

var _tmpl$$o = /* @__PURE__ */template(`<div class=color_menu><div class=cpick_separator></div><div class=cpick_separator></div><div class=current_color><input type=color><input type=text pattern=^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$><div class=opacity_txt></div><input type=range step=5>`),
  _tmpl$2$h = /* @__PURE__ */template(`<div><div></div><input type=color_picker>`),
  _tmpl$3$9 = /* @__PURE__ */template(`<div class=color_set>`),
  _tmpl$4$8 = /* @__PURE__ */template(`<div class=color_box>`),
  _tmpl$5$7 = /* @__PURE__ */template(`<div class="color_set user_opts"><div class=color_box></div><div class=color_box>`);
const default_colors = ["#FFFFFF", "#CCCCCC", "#999999", "#666666", "#333333", "#000000", "#EBB0B0", "#E9CEA1", "#E5DF80", "#ADEB97", "#A3C3EA", "#D8BDED", "#E15F5D", "#E1B45F", "#E2D947", "#4BE940", "#639AE1", "#D7A0E8", "#E42C2A", "#E49D30", "#E7D827", "#3CFF0A", "#3275E4", "#B06CE3", "#F3000D", "#EE9A14", "#F1DA13", "#2DFC0F", "#1562EE", "#BB00EF", "#B50911", "#E3860E", "#D2BD11", "#48DE0E", "#1455B4", "#6E009F", "#7C1713", "#B76B12", "#8D7A13", "#479C12", "#165579", "#51007E"];
const default_color_props = {
  userColors: [],
  setUserColors: () => {}
};
let ColorPickerContext = createContext(default_color_props);
function ColorPickerCTX() {
  return useContext(ColorPickerContext);
}
function ColorContext(props) {
  const [userColors, setUserColors] = createStore([]);
  window.api.set_user_colors = setUserColors;
  const ColorPickerCTX2 = {
    userColors,
    setUserColors
  };
  ColorPickerContext = createContext(ColorPickerCTX2);
  return createComponent(ColorPickerContext.Provider, {
    value: ColorPickerCTX2,
    get children() {
      return props.children;
    }
  });
}
function ColorInput(props) {
  let divRef = document.createElement("div");
  let hexInEl = document.createElement("input");
  let colorInEl = document.createElement("input");
  let opacityInEl = document.createElement("input");
  const [showMenu, setShowMenu] = createSignal(false);
  const [selectedColor, setSelectedColor] = createSignal(props.init_color === "" ? "#00000000" : props.init_color.startsWith("#") ? props.init_color : RGBAToHex(props.init_color));
  const [, divProps] = splitProps(props, ["input_id", "init_color", "onInput"]);
  const hide_menu = e => {
    if (!divRef.contains(e.target)) setShowMenu(false);
  };
  onMount(() => document.addEventListener("mousedown", hide_menu));
  onCleanup(() => document.removeEventListener("mousedown", hide_menu));
  const opacity_dec = () => Math.round(Number("0x" + selectedColor().slice(7, 9)) / 2.55);
  const opacity_hex = () => Math.round(parseInt(opacityInEl.value) * 2.55).toString(16).padStart(2, "0").toUpperCase();
  function onOpacityInput() {
    setSelectedColor(selectedColor().slice(0, 7) + opacity_hex());
  }
  function onMouseSelect(e, color) {
    if (e.button === 0) setSelectedColor(color + opacity_hex());
  }
  createEffect(on$1(selectedColor, () => {
    if (props.onInput) props.onInput(selectedColor());
  }, {
    defer: true
  }
  // Prevent this from firing an update when the Component is simply mounted
  ));
  return (() => {
    var _el$ = _tmpl$2$h(),
      _el$2 = _el$.firstChild,
      _el$1 = _el$2.nextSibling;
    var _ref$ = divRef;
    typeof _ref$ === "function" ? use(_ref$, _el$) : divRef = _el$;
    spread(_el$, mergeProps(divProps, {
      get style() {
        return {
          "background-color": selectedColor()
        };
      }
    }), false, true);
    _el$2.$$click = e => {
      if (e.button === 0) setShowMenu(true);
    };
    _el$2.style.setProperty("width", "100%");
    _el$2.style.setProperty("height", "100%");
    _el$2.style.setProperty("position", "relative");
    insert(_el$2, createComponent(Show, {
      get when() {
        return showMenu();
      },
      get children() {
        var _el$3 = _tmpl$$o(),
          _el$4 = _el$3.firstChild,
          _el$5 = _el$4.nextSibling,
          _el$6 = _el$5.nextSibling,
          _el$7 = _el$6.firstChild,
          _el$8 = _el$7.nextSibling,
          _el$9 = _el$8.nextSibling,
          _el$0 = _el$9.nextSibling;
        insert(_el$3, createComponent(DefaultColorSet, {
          onSel: onMouseSelect
        }), _el$4);
        insert(_el$3, createComponent(UserColorSet, {
          onSel: onMouseSelect,
          selectedColor
        }), _el$5);
        _el$7.$$input = () => setSelectedColor(colorInEl.value + opacity_hex());
        var _ref$2 = colorInEl;
        typeof _ref$2 === "function" ? use(_ref$2, _el$7) : colorInEl = _el$7;
        _el$8.addEventListener("blur", () => {
          if (hexInEl.value.length === 9) setSelectedColor(hexInEl.value);else if (hexInEl.value.length === 7) setSelectedColor(hexInEl.value + opacity_hex());
        });
        var _ref$3 = hexInEl;
        typeof _ref$3 === "function" ? use(_ref$3, _el$8) : hexInEl = _el$8;
        _el$0.$$input = onOpacityInput;
        var _ref$4 = opacityInEl;
        typeof _ref$4 === "function" ? use(_ref$4, _el$0) : opacityInEl = _el$0;
        createRenderEffect(_p$ => {
          var _v$ = selectedColor().slice(0, 7),
            _v$2 = "Opacity: " + opacity_dec().toString() + "%";
          _v$ !== _p$.e && ((_p$.e = _v$) != null ? _el$7.style.setProperty("background-color", _v$) : _el$7.style.removeProperty("background-color"));
          _v$2 !== _p$.t && (_el$9.innerText = _p$.t = _v$2);
          return _p$;
        }, {
          e: void 0,
          t: void 0
        });
        createRenderEffect(() => _el$7.value = selectedColor().slice(0, 7));
        createRenderEffect(() => _el$8.value = selectedColor());
        createRenderEffect(() => _el$0.value = selectedColor().length === 9 ? opacity_dec() : 100);
        return _el$3;
      }
    }));
    createRenderEffect(() => setAttribute(_el$1, "id", props.input_id));
    createRenderEffect(() => _el$1.value = selectedColor());
    return _el$;
  })();
}
function DefaultColorSet(props) {
  return (() => {
    var _el$10 = _tmpl$3$9();
    insert(_el$10, createComponent(For, {
      each: default_colors,
      children: color => (() => {
        var _el$11 = _tmpl$4$8();
        _el$11.$$mousedown = e => props.onSel(e, color);
        color != null ? _el$11.style.setProperty("background-color", color) : _el$11.style.removeProperty("background-color");
        return _el$11;
      })()
    }));
    return _el$10;
  })();
}
function UserColorSet(props) {
  const {
    userColors,
    setUserColors
  } = ColorPickerCTX();
  const remove_color = createSignal(false);
  return (() => {
    var _el$12 = _tmpl$5$7(),
      _el$13 = _el$12.firstChild,
      _el$14 = _el$13.nextSibling;
    insert(_el$12, createComponent(For, {
      each: userColors,
      children: (color, i) => (() => {
        var _el$15 = _tmpl$4$8();
        _el$15.$$click = e => {
          if (remove_color[0]()) setUserColors([...userColors.slice(0, i()), ...userColors.slice(i() + 1)]);else props.onSel(e, color);
        };
        color != null ? _el$15.style.setProperty("background-color", color) : _el$15.style.removeProperty("background-color");
        return _el$15;
      })()
    }), _el$13);
    insert(_el$13, createComponent(Icon, {
      get icon() {
        return icons.options_add;
      },
      style: {
        width: "18px",
        height: "18px"
      },
      onClick: () => setUserColors([...userColors, props.selectedColor().slice(0, 7)])
    }));
    insert(_el$14, createComponent(Icon, {
      get icon() {
        return icons.options_remove;
      },
      style: {
        width: "18px",
        height: "18px"
      },
      get ["attr:active"]() {
        return remove_color[0]() ? "" : void 0;
      },
      onClick: () => remove_color[1](!remove_color[0]())
    }));
    return _el$12;
  })();
}
function RGBAToHex(rgba, forceRemoveAlpha = false) {
  return "#" + rgba.replace(/^rgba?\(|\s+|\)$/g, "").split(",").filter((string, index) => !forceRemoveAlpha || index !== 3).map(string => parseFloat(string)).map((number, index) => index === 3 ? Math.round(number * 255) : number).map(number => number.toString(16)).map(string => string.length === 1 ? "0" + string : string).join("");
}
delegateEvents(["click", "input", "mousedown"]);

var _tmpl$$n = /* @__PURE__ */ template(`<div>`);
var Layout$1 = class Layout {
  x;
  y;
  width;
  height;
  constructor(rect) {
    this.x = Math.floor(rect.x);
    this.y = Math.floor(rect.y);
    this.width = Math.floor(rect.width);
    this.height = Math.floor(rect.height);
  }
  get rect() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height
    };
  }
  get left() {
    return this.x;
  }
  get top() {
    return this.y;
  }
  get right() {
    return this.x + this.width;
  }
  get bottom() {
    return this.y + this.height;
  }
  get center() {
    return {
      x: this.x + this.width * 0.5,
      y: this.y + this.height * 0.5
    };
  }
  get corners() {
    return {
      topLeft: {
        x: this.left,
        y: this.top
      },
      topRight: {
        x: this.right,
        y: this.top
      },
      bottomRight: {
        x: this.left,
        y: this.bottom
      },
      bottomLeft: {
        x: this.right,
        y: this.bottom
      }
    };
  }
};
var elementLayout = (element) => {
  let layout = new Layout$1(element.getBoundingClientRect());
  const {
    transform
  } = getComputedStyle(element);
  if (transform) {
    layout = stripTransformFromLayout(layout, transform);
  }
  return layout;
};
var stripTransformFromLayout = (layout, transform) => {
  let translateX, translateY;
  if (transform.startsWith("matrix3d(")) {
    const matrix = transform.slice(9, -1).split(/, /);
    translateX = +matrix[12];
    translateY = +matrix[13];
  } else if (transform.startsWith("matrix(")) {
    const matrix = transform.slice(7, -1).split(/, /);
    translateX = +matrix[4];
    translateY = +matrix[5];
  } else {
    translateX = 0;
    translateY = 0;
  }
  return new Layout$1({
    ...layout,
    x: layout.x - translateX,
    y: layout.y - translateY
  });
};
var noopTransform = () => ({
  x: 0,
  y: 0
});
var transformsAreEqual = (firstTransform, secondTransform) => {
  return firstTransform.x === secondTransform.x && firstTransform.y === secondTransform.y;
};
var transformLayout = (layout, transform) => {
  return new Layout$1({
    ...layout,
    x: layout.x + transform.x,
    y: layout.y + transform.y
  });
};
var distanceBetweenPoints = (firstPoint, secondPoint) => {
  return Math.sqrt(Math.pow(firstPoint.x - secondPoint.x, 2) + Math.pow(firstPoint.y - secondPoint.y, 2));
};
var intersectionRatioOfLayouts = (firstLayout, secondLayout) => {
  const top = Math.max(firstLayout.top, secondLayout.top);
  const left = Math.max(firstLayout.left, secondLayout.left);
  const right = Math.min(firstLayout.right, secondLayout.right);
  const bottom = Math.min(firstLayout.bottom, secondLayout.bottom);
  const width = right - left;
  const height = bottom - top;
  if (left < right && top < bottom) {
    const layout1Area = firstLayout.width * firstLayout.height;
    const layout2Area = secondLayout.width * secondLayout.height;
    const intersectionArea = width * height;
    return intersectionArea / (layout1Area + layout2Area - intersectionArea);
  }
  return 0;
};
var layoutsAreEqual = (firstLayout, secondLayout) => {
  return firstLayout.x === secondLayout.x && firstLayout.y === secondLayout.y && firstLayout.width === secondLayout.width && firstLayout.height === secondLayout.height;
};
var closestCenter = (draggable, droppables, context) => {
  const point1 = draggable.transformed.center;
  const collision = {
    distance: Infinity,
    droppable: null
  };
  for (const droppable of droppables) {
    const distance = distanceBetweenPoints(point1, droppable.layout.center);
    if (distance < collision.distance) {
      collision.distance = distance;
      collision.droppable = droppable;
    } else if (distance === collision.distance && droppable.id === context.activeDroppableId) {
      collision.droppable = droppable;
    }
  }
  return collision.droppable;
};
var mostIntersecting = (draggable, droppables, context) => {
  const draggableLayout = draggable.transformed;
  const collision = {
    ratio: 0,
    droppable: null
  };
  for (const droppable of droppables) {
    const ratio = intersectionRatioOfLayouts(draggableLayout, droppable.layout);
    if (ratio > collision.ratio) {
      collision.ratio = ratio;
      collision.droppable = droppable;
    } else if (ratio > 0 && ratio === collision.ratio && droppable.id === context.activeDroppableId) {
      collision.droppable = droppable;
    }
  }
  return collision.droppable;
};
var Context = createContext();
var DragDropProvider = (passedProps) => {
  const props = mergeProps({
    collisionDetector: mostIntersecting
  }, passedProps);
  const [state, setState] = createStore({
    draggables: {},
    droppables: {},
    sensors: {},
    active: {
      draggableId: null,
      get draggable() {
        return state.active.draggableId !== null ? state.draggables[state.active.draggableId] : null;
      },
      droppableId: null,
      get droppable() {
        return state.active.droppableId !== null ? state.droppables[state.active.droppableId] : null;
      },
      sensorId: null,
      get sensor() {
        return state.active.sensorId !== null ? state.sensors[state.active.sensorId] : null;
      },
      overlay: null
    }
  });
  const addTransformer = (type, id, transformer) => {
    type.substring(0, type.length - 1);
    if (!untrack(() => state[type][id])) {
      return;
    }
    setState(type, id, "transformers", transformer.id, transformer);
  };
  const removeTransformer = (type, id, transformerId) => {
    type.substring(0, type.length - 1);
    if (!untrack(() => state[type][id])) {
      return;
    }
    if (!untrack(() => state[type][id]["transformers"][transformerId])) {
      return;
    }
    setState(type, id, "transformers", transformerId, void 0);
  };
  const addDraggable = ({
    id,
    node,
    layout,
    data
  }) => {
    const existingDraggable = state.draggables[id];
    const draggable = {
      id,
      node,
      layout,
      data,
      _pendingCleanup: false
    };
    let transformer;
    if (!existingDraggable) {
      Object.defineProperties(draggable, {
        transformers: {
          enumerable: true,
          configurable: true,
          writable: true,
          value: {}
        },
        transform: {
          enumerable: true,
          configurable: true,
          get: () => {
            if (state.active.overlay) {
              return noopTransform();
            }
            const transformers = Object.values(state.draggables[id].transformers);
            transformers.sort((a, b) => a.order - b.order);
            return transformers.reduce((transform, transformer2) => {
              return transformer2.callback(transform);
            }, noopTransform());
          }
        },
        transformed: {
          enumerable: true,
          configurable: true,
          get: () => {
            return transformLayout(state.draggables[id].layout, state.draggables[id].transform);
          }
        }
      });
    } else if (state.active.draggableId === id && !state.active.overlay) {
      const layoutDelta = {
        x: existingDraggable.layout.x - layout.x,
        y: existingDraggable.layout.y - layout.y
      };
      const transformerId = "addDraggable-existing-offset";
      const existingTransformer = existingDraggable.transformers[transformerId];
      const transformOffset = existingTransformer ? existingTransformer.callback(layoutDelta) : layoutDelta;
      transformer = {
        id: transformerId,
        order: 100,
        callback: (transform) => {
          return {
            x: transform.x + transformOffset.x,
            y: transform.y + transformOffset.y
          };
        }
      };
      onDragEnd(() => removeTransformer("draggables", id, transformerId));
    }
    batch(() => {
      setState("draggables", id, draggable);
      if (transformer) {
        addTransformer("draggables", id, transformer);
      }
    });
    if (state.active.draggable) {
      recomputeLayouts();
    }
  };
  const removeDraggable = (id) => {
    if (!untrack(() => state.draggables[id])) {
      return;
    }
    setState("draggables", id, "_pendingCleanup", true);
    queueMicrotask(() => cleanupDraggable(id));
  };
  const cleanupDraggable = (id) => {
    if (state.draggables[id]?._pendingCleanup) {
      const cleanupActive = state.active.draggableId === id;
      batch(() => {
        if (cleanupActive) {
          setState("active", "draggableId", null);
        }
        setState("draggables", id, void 0);
      });
    }
  };
  const addDroppable = ({
    id,
    node,
    layout,
    data
  }) => {
    const existingDroppable = state.droppables[id];
    const droppable = {
      id,
      node,
      layout,
      data,
      _pendingCleanup: false
    };
    if (!existingDroppable) {
      Object.defineProperties(droppable, {
        transformers: {
          enumerable: true,
          configurable: true,
          writable: true,
          value: {}
        },
        transform: {
          enumerable: true,
          configurable: true,
          get: () => {
            const transformers = Object.values(state.droppables[id].transformers);
            transformers.sort((a, b) => a.order - b.order);
            return transformers.reduce((transform, transformer) => {
              return transformer.callback(transform);
            }, noopTransform());
          }
        },
        transformed: {
          enumerable: true,
          configurable: true,
          get: () => {
            return transformLayout(state.droppables[id].layout, state.droppables[id].transform);
          }
        }
      });
    }
    setState("droppables", id, droppable);
    if (state.active.draggable) {
      recomputeLayouts();
    }
  };
  const removeDroppable = (id) => {
    if (!untrack(() => state.droppables[id])) {
      return;
    }
    setState("droppables", id, "_pendingCleanup", true);
    queueMicrotask(() => cleanupDroppable(id));
  };
  const cleanupDroppable = (id) => {
    if (state.droppables[id]?._pendingCleanup) {
      const cleanupActive = state.active.droppableId === id;
      batch(() => {
        if (cleanupActive) {
          setState("active", "droppableId", null);
        }
        setState("droppables", id, void 0);
      });
    }
  };
  const addSensor = ({
    id,
    activators
  }) => {
    setState("sensors", id, {
      id,
      activators,
      coordinates: {
        origin: {
          x: 0,
          y: 0
        },
        current: {
          x: 0,
          y: 0
        },
        get delta() {
          return {
            x: state.sensors[id].coordinates.current.x - state.sensors[id].coordinates.origin.x,
            y: state.sensors[id].coordinates.current.y - state.sensors[id].coordinates.origin.y
          };
        }
      }
    });
  };
  const removeSensor = (id) => {
    if (!untrack(() => state.sensors[id])) {
      return;
    }
    const cleanupActive = state.active.sensorId === id;
    batch(() => {
      if (cleanupActive) {
        setState("active", "sensorId", null);
      }
      setState("sensors", id, void 0);
    });
  };
  const setOverlay = ({
    node,
    layout
  }) => {
    const existing = state.active.overlay;
    const overlay = {
      node,
      layout
    };
    if (!existing) {
      Object.defineProperties(overlay, {
        id: {
          enumerable: true,
          configurable: true,
          get: () => state.active.draggable?.id
        },
        data: {
          enumerable: true,
          configurable: true,
          get: () => state.active.draggable?.data
        },
        transformers: {
          enumerable: true,
          configurable: true,
          get: () => Object.fromEntries(Object.entries(state.active.draggable ? state.active.draggable.transformers : {}).filter(([id]) => id !== "addDraggable-existing-offset"))
        },
        transform: {
          enumerable: true,
          configurable: true,
          get: () => {
            const transformers = Object.values(state.active.overlay ? state.active.overlay.transformers : []);
            transformers.sort((a, b) => a.order - b.order);
            return transformers.reduce((transform, transformer) => {
              return transformer.callback(transform);
            }, noopTransform());
          }
        },
        transformed: {
          enumerable: true,
          configurable: true,
          get: () => {
            return state.active.overlay ? transformLayout(state.active.overlay.layout, state.active.overlay.transform) : new Layout$1({
              x: 0,
              y: 0,
              width: 0,
              height: 0
            });
          }
        }
      });
    }
    setState("active", "overlay", overlay);
  };
  const clearOverlay = () => setState("active", "overlay", null);
  const sensorStart = (id, coordinates) => {
    batch(() => {
      setState("sensors", id, "coordinates", {
        origin: {
          ...coordinates
        },
        current: {
          ...coordinates
        }
      });
      setState("active", "sensorId", id);
    });
  };
  const sensorMove = (coordinates) => {
    const sensorId = state.active.sensorId;
    if (!sensorId) {
      return;
    }
    setState("sensors", sensorId, "coordinates", "current", {
      ...coordinates
    });
  };
  const sensorEnd = () => setState("active", "sensorId", null);
  const draggableActivators = (draggableId, asHandlers) => {
    const eventMap = {};
    for (const sensor of Object.values(state.sensors)) {
      if (sensor) {
        for (const [type, activator] of Object.entries(sensor.activators)) {
          eventMap[type] ??= [];
          eventMap[type].push({
            sensor,
            activator
          });
        }
      }
    }
    const listeners = {};
    for (const key in eventMap) {
      let handlerKey = key;
      if (asHandlers) {
        handlerKey = `on${key}`;
      }
      listeners[handlerKey] = (event) => {
        for (const {
          activator
        } of eventMap[key]) {
          if (state.active.sensor) {
            break;
          }
          activator(event, draggableId);
        }
      };
    }
    return listeners;
  };
  const recomputeLayouts = () => {
    let anyLayoutChanged = false;
    const draggables = Object.values(state.draggables);
    const droppables = Object.values(state.droppables);
    const overlay = state.active.overlay;
    batch(() => {
      const cache = /* @__PURE__ */ new WeakMap();
      for (const draggable of draggables) {
        if (draggable) {
          const currentLayout = draggable.layout;
          if (!cache.has(draggable.node)) cache.set(draggable.node, elementLayout(draggable.node));
          const layout = cache.get(draggable.node);
          if (!layoutsAreEqual(currentLayout, layout)) {
            setState("draggables", draggable.id, "layout", layout);
            anyLayoutChanged = true;
          }
        }
      }
      for (const droppable of droppables) {
        if (droppable) {
          const currentLayout = droppable.layout;
          if (!cache.has(droppable.node)) cache.set(droppable.node, elementLayout(droppable.node));
          const layout = cache.get(droppable.node);
          if (!layoutsAreEqual(currentLayout, layout)) {
            setState("droppables", droppable.id, "layout", layout);
            anyLayoutChanged = true;
          }
        }
      }
      if (overlay) {
        const currentLayout = overlay.layout;
        const layout = elementLayout(overlay.node);
        if (!layoutsAreEqual(currentLayout, layout)) {
          setState("active", "overlay", "layout", layout);
          anyLayoutChanged = true;
        }
      }
    });
    return anyLayoutChanged;
  };
  const detectCollisions = () => {
    const draggable = state.active.overlay ?? state.active.draggable;
    if (draggable) {
      const droppable = props.collisionDetector(draggable, Object.values(state.droppables), {
        activeDroppableId: state.active.droppableId
      });
      const droppableId = droppable ? droppable.id : null;
      if (state.active.droppableId !== droppableId) {
        setState("active", "droppableId", droppableId);
      }
    }
  };
  const dragStart = (draggableId) => {
    const transformer = {
      id: "sensorMove",
      order: 0,
      callback: (transform) => {
        if (state.active.sensor) {
          return {
            x: transform.x + state.active.sensor.coordinates.delta.x,
            y: transform.y + state.active.sensor.coordinates.delta.y
          };
        }
        return transform;
      }
    };
    recomputeLayouts();
    batch(() => {
      setState("active", "draggableId", draggableId);
      addTransformer("draggables", draggableId, transformer);
    });
    detectCollisions();
  };
  const dragEnd = () => {
    const draggableId = untrack(() => state.active.draggableId);
    batch(() => {
      if (draggableId !== null) {
        removeTransformer("draggables", draggableId, "sensorMove");
      }
      setState("active", ["draggableId", "droppableId"], null);
    });
    recomputeLayouts();
  };
  const onDragStart = (handler) => {
    createEffect(() => {
      const draggable = state.active.draggable;
      if (draggable) {
        untrack(() => handler({
          draggable
        }));
      }
    });
  };
  const onDragMove = (handler) => {
    createEffect(() => {
      const draggable = state.active.draggable;
      if (draggable) {
        const overlay = untrack(() => state.active.overlay);
        Object.values(overlay ? overlay.transform : draggable.transform);
        untrack(() => handler({
          draggable,
          overlay
        }));
      }
    });
  };
  const onDragOver = (handler) => {
    createEffect(() => {
      const draggable = state.active.draggable;
      const droppable = state.active.droppable;
      if (draggable) {
        untrack(() => handler({
          draggable,
          droppable,
          overlay: state.active.overlay
        }));
      }
    });
  };
  const onDragEnd = (handler) => {
    createEffect(({
      previousDraggable,
      previousDroppable,
      previousOverlay
    }) => {
      const draggable = state.active.draggable;
      const droppable = draggable ? state.active.droppable : null;
      const overlay = draggable ? state.active.overlay : null;
      if (!draggable && previousDraggable) {
        untrack(() => handler({
          draggable: previousDraggable,
          droppable: previousDroppable,
          overlay: previousOverlay
        }));
      }
      return {
        previousDraggable: draggable,
        previousDroppable: droppable,
        previousOverlay: overlay
      };
    }, {
      previousDraggable: null,
      previousDroppable: null,
      previousOverlay: null
    });
  };
  onDragMove(() => detectCollisions());
  props.onDragStart && onDragStart(props.onDragStart);
  props.onDragMove && onDragMove(props.onDragMove);
  props.onDragOver && onDragOver(props.onDragOver);
  props.onDragEnd && onDragEnd(props.onDragEnd);
  const actions = {
    addTransformer,
    removeTransformer,
    addDraggable,
    removeDraggable,
    addDroppable,
    removeDroppable,
    addSensor,
    removeSensor,
    setOverlay,
    clearOverlay,
    recomputeLayouts,
    detectCollisions,
    draggableActivators,
    sensorStart,
    sensorMove,
    sensorEnd,
    dragStart,
    dragEnd,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd
  };
  const context = [state, actions];
  return createComponent(Context.Provider, {
    value: context,
    get children() {
      return props.children;
    }
  });
};
var useDragDropContext = () => {
  return useContext(Context) || null;
};
var createPointerSensor = (id = "pointer-sensor") => {
  const [state, {
    addSensor,
    removeSensor,
    sensorStart,
    sensorMove,
    sensorEnd,
    dragStart,
    dragEnd
  }] = useDragDropContext();
  const activationDelay = 250;
  const activationDistance = 10;
  onMount(() => {
    addSensor({
      id,
      activators: {
        pointerdown: attach
      }
    });
  });
  onCleanup(() => {
    removeSensor(id);
  });
  const isActiveSensor = () => state.active.sensorId === id;
  const initialCoordinates = {
    x: 0,
    y: 0
  };
  let activationDelayTimeoutId = null;
  let activationDraggableId = null;
  const attach = (event, draggableId) => {
    if (event.button !== 0) return;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    activationDraggableId = draggableId;
    initialCoordinates.x = event.clientX;
    initialCoordinates.y = event.clientY;
    activationDelayTimeoutId = window.setTimeout(onActivate, activationDelay);
  };
  const detach = () => {
    if (activationDelayTimeoutId) {
      clearTimeout(activationDelayTimeoutId);
      activationDelayTimeoutId = null;
    }
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("selectionchange", clearSelection);
  };
  const onActivate = () => {
    if (!state.active.sensor) {
      sensorStart(id, initialCoordinates);
      dragStart(activationDraggableId);
      clearSelection();
      document.addEventListener("selectionchange", clearSelection);
    } else if (!isActiveSensor()) {
      detach();
    }
  };
  const onPointerMove = (event) => {
    const coordinates = {
      x: event.clientX,
      y: event.clientY
    };
    if (!state.active.sensor) {
      const transform = {
        x: coordinates.x - initialCoordinates.x,
        y: coordinates.y - initialCoordinates.y
      };
      if (Math.sqrt(transform.x ** 2 + transform.y ** 2) > activationDistance) {
        onActivate();
      }
    }
    if (isActiveSensor()) {
      event.preventDefault();
      sensorMove(coordinates);
    }
  };
  const onPointerUp = (event) => {
    detach();
    if (isActiveSensor()) {
      event.preventDefault();
      dragEnd();
      sensorEnd();
    }
  };
  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
  };
};
var DragDropSensors = (props) => {
  createPointerSensor();
  return memo(() => props.children);
};
var transformStyle = (transform) => {
  return {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`
  };
};
var createDraggable = (id, data = {}) => {
  const [state, {
    addDraggable,
    removeDraggable,
    draggableActivators
  }] = useDragDropContext();
  const [node, setNode] = createSignal(null);
  onMount(() => {
    const resolvedNode = node();
    if (resolvedNode) {
      addDraggable({
        id,
        node: resolvedNode,
        layout: elementLayout(resolvedNode),
        data
      });
    }
  });
  onCleanup(() => removeDraggable(id));
  const isActiveDraggable = () => state.active.draggableId === id;
  const transform = () => {
    return state.draggables[id]?.transform || noopTransform();
  };
  const draggable = Object.defineProperties((element, accessor) => {
    const config = accessor ? accessor() : {};
    createEffect(() => {
      const resolvedNode = node();
      const activators = draggableActivators(id);
      if (resolvedNode) {
        for (const key in activators) {
          resolvedNode.addEventListener(key, activators[key]);
        }
      }
      onCleanup(() => {
        if (resolvedNode) {
          for (const key in activators) {
            resolvedNode.removeEventListener(key, activators[key]);
          }
        }
      });
    });
    setNode(element);
    if (!config.skipTransform) {
      createEffect(() => {
        const resolvedTransform = transform();
        if (!transformsAreEqual(resolvedTransform, noopTransform())) {
          const style = transformStyle(transform());
          element.style.setProperty("transform", style.transform ?? null);
        } else {
          element.style.removeProperty("transform");
        }
      });
    }
  }, {
    ref: {
      enumerable: true,
      value: setNode
    },
    isActiveDraggable: {
      enumerable: true,
      get: isActiveDraggable
    },
    dragActivators: {
      enumerable: true,
      get: () => {
        return draggableActivators(id, true);
      }
    },
    transform: {
      enumerable: true,
      get: transform
    }
  });
  return draggable;
};
var createDroppable = (id, data = {}) => {
  const [state, {
    addDroppable,
    removeDroppable
  }] = useDragDropContext();
  const [node, setNode] = createSignal(null);
  onMount(() => {
    const resolvedNode = node();
    if (resolvedNode) {
      addDroppable({
        id,
        node: resolvedNode,
        layout: elementLayout(resolvedNode),
        data
      });
    }
  });
  onCleanup(() => removeDroppable(id));
  const isActiveDroppable = () => state.active.droppableId === id;
  const transform = () => {
    return state.droppables[id]?.transform || noopTransform();
  };
  const droppable = Object.defineProperties((element, accessor) => {
    const config = accessor ? accessor() : {};
    setNode(element);
    if (!config.skipTransform) {
      createEffect(() => {
        const resolvedTransform = transform();
        if (!transformsAreEqual(resolvedTransform, noopTransform())) {
          const style = transformStyle(transform());
          element.style.setProperty("transform", style.transform ?? null);
        } else {
          element.style.removeProperty("transform");
        }
      });
    }
  }, {
    ref: {
      enumerable: true,
      value: setNode
    },
    isActiveDroppable: {
      enumerable: true,
      get: isActiveDroppable
    },
    transform: {
      enumerable: true,
      get: transform
    }
  });
  return droppable;
};
var DragOverlay = (props) => {
  const [state, {
    onDragStart,
    onDragEnd,
    setOverlay,
    clearOverlay
  }] = useDragDropContext();
  let node;
  onDragStart(({
    draggable
  }) => {
    setOverlay({
      node: draggable.node,
      layout: draggable.layout
    });
    queueMicrotask(() => {
      if (node) {
        const layout = elementLayout(node);
        const delta = {
          x: (draggable.layout.width - layout.width) / 2,
          y: (draggable.layout.height - layout.height) / 2
        };
        layout.x += delta.x;
        layout.y += delta.y;
        setOverlay({
          node,
          layout
        });
      }
    });
  });
  onDragEnd(() => queueMicrotask(clearOverlay));
  const style$1 = () => {
    const overlay = state.active.overlay;
    const draggable = state.active.draggable;
    if (!overlay || !draggable) return {};
    return {
      position: "fixed",
      transition: "transform 0s",
      top: `${overlay.layout.top}px`,
      left: `${overlay.layout.left}px`,
      "min-width": `${draggable.layout.width}px`,
      "min-height": `${draggable.layout.height}px`,
      ...transformStyle(overlay.transform),
      ...props.style
    };
  };
  return createComponent(Portal, {
    get mount() {
      return document.body;
    },
    get children() {
      return createComponent(Show, {
        get when() {
          return state.active.draggable;
        },
        get children() {
          var _el$ = _tmpl$$n();
          var _ref$ = node;
          typeof _ref$ === "function" ? use(_ref$, _el$) : node = _el$;
          insert(_el$, (() => {
            var _c$ = memo(() => typeof props.children === "function");
            return () => _c$() ? props.children(state.active.draggable) : props.children;
          })());
          createRenderEffect((_p$) => {
            var _v$ = props.class, _v$2 = style$1();
            _v$ !== _p$.e && className(_el$, _p$.e = _v$);
            _p$.t = style(_el$, _v$2, _p$.t);
            return _p$;
          }, {
            e: void 0,
            t: void 0
          });
          return _el$;
        }
      });
    }
  });
};
var moveArrayItem = (array, fromIndex, toIndex) => {
  const newArray = array.slice();
  newArray.splice(toIndex, 0, ...newArray.splice(fromIndex, 1));
  return newArray;
};
var Context2 = createContext();
var SortableProvider = (props) => {
  const [dndState] = useDragDropContext();
  const [state, setState] = createStore({
    initialIds: [],
    sortedIds: []
  });
  const isValidIndex = (index) => {
    return index >= 0 && index < state.initialIds.length;
  };
  createEffect(() => {
    setState("initialIds", [...props.ids]);
    setState("sortedIds", [...props.ids]);
  });
  createEffect(() => {
    if (dndState.active.draggableId && dndState.active.droppableId) {
      untrack(() => {
        const fromIndex = state.sortedIds.indexOf(dndState.active.draggableId);
        const toIndex = state.initialIds.indexOf(dndState.active.droppableId);
        if (!isValidIndex(fromIndex) || !isValidIndex(toIndex)) {
          setState("sortedIds", [...props.ids]);
        } else if (fromIndex !== toIndex) {
          const resorted = moveArrayItem(state.sortedIds, fromIndex, toIndex);
          setState("sortedIds", resorted);
        }
      });
    } else {
      setState("sortedIds", [...props.ids]);
    }
  });
  const actions = {};
  const context = [state, actions];
  return createComponent(Context2.Provider, {
    value: context,
    get children() {
      return props.children;
    }
  });
};
var useSortableContext = () => {
  return useContext(Context2) || null;
};
var combineRefs = (setRefA, setRefB) => {
  return (ref) => {
    setRefA(ref);
    setRefB(ref);
  };
};
var createSortable = (id, data = {}) => {
  const [dndState, {
    addTransformer,
    removeTransformer
  }] = useDragDropContext();
  const [sortableState] = useSortableContext();
  const draggable = createDraggable(id, data);
  const droppable = createDroppable(id, data);
  const setNode = combineRefs(draggable.ref, droppable.ref);
  const initialIndex = () => sortableState.initialIds.indexOf(id);
  const currentIndex = () => sortableState.sortedIds.indexOf(id);
  const layoutById = (id2) => dndState.droppables[id2]?.layout || null;
  const sortedTransform = () => {
    const delta = noopTransform();
    const resolvedInitialIndex = initialIndex();
    const resolvedCurrentIndex = currentIndex();
    if (resolvedCurrentIndex !== resolvedInitialIndex) {
      const currentLayout = layoutById(id);
      const targetLayout = layoutById(sortableState.initialIds[resolvedCurrentIndex]);
      if (currentLayout && targetLayout) {
        delta.x = targetLayout.x - currentLayout.x;
        delta.y = targetLayout.y - currentLayout.y;
      }
    }
    return delta;
  };
  const transformer = {
    id: "sortableOffset",
    order: 100,
    callback: (transform2) => {
      const delta = sortedTransform();
      return {
        x: transform2.x + delta.x,
        y: transform2.y + delta.y
      };
    }
  };
  onMount(() => addTransformer("droppables", id, transformer));
  onCleanup(() => removeTransformer("droppables", id, transformer.id));
  const transform = () => {
    return (id === dndState.active.draggableId && !dndState.active.overlay ? dndState.draggables[id]?.transform : dndState.droppables[id]?.transform) || noopTransform();
  };
  const sortable = Object.defineProperties((element) => {
    draggable(element, () => ({
      skipTransform: true
    }));
    droppable(element, () => ({
      skipTransform: true
    }));
    createEffect(() => {
      const resolvedTransform = transform();
      if (!transformsAreEqual(resolvedTransform, noopTransform())) {
        const style = transformStyle(transform());
        element.style.setProperty("transform", style.transform ?? null);
      } else {
        element.style.removeProperty("transform");
      }
    });
  }, {
    ref: {
      enumerable: true,
      value: setNode
    },
    transform: {
      enumerable: true,
      get: transform
    },
    isActiveDraggable: {
      enumerable: true,
      get: () => draggable.isActiveDraggable
    },
    dragActivators: {
      enumerable: true,
      get: () => draggable.dragActivators
    },
    isActiveDroppable: {
      enumerable: true,
      get: () => droppable.isActiveDroppable
    }
  });
  return sortable;
};

var _tmpl$$m = /* @__PURE__ */template(`<div>`),
  _tmpl$2$g = /* @__PURE__ */template(`<div class=drag_tag><span></span><div class=drag_tag_bottom_border>`),
  _tmpl$3$8 = /* @__PURE__ */template(`<div class=drag_tag_overlay><span></span><div class=drag_tag_bottom_border>`);
function DraggableSelection(props) {
  const [, div_props] = splitProps(props, ["ids", "children", "overlay_child", "reorder_function"]);
  if (div_props.classList) div_props.classList["drag_tag_column"] = true;else div_props["classList"] = {
    "drag_tag_column": true
  };
  const [activeItem, setActiveItem] = createSignal("");
  const onDragStart = ({
    draggable
  }) => {
    setActiveItem(draggable.id);
  };
  const onDragEnd = ({
    draggable,
    droppable
  }) => {
    if (draggable && droppable) {
      const currentItems = props.ids?.() ?? [];
      const fromIndex = currentItems.indexOf(draggable.id);
      const toIndex = currentItems.indexOf(droppable.id);
      if (fromIndex !== toIndex) props.reorder_function(fromIndex, toIndex);
    }
  };
  return createComponent(DragDropProvider, {
    onDragStart,
    onDragEnd,
    collisionDetector: closestCenter,
    get children() {
      return [createComponent(DragDropSensors, {}), createComponent(ConstrainVerticalDrag, {}), (() => {
        var _el$ = _tmpl$$m();
        spread(_el$, div_props, false, true);
        insert(_el$, createComponent(SortableProvider, {
          get ids() {
            return props.ids?.() ?? [];
          },
          get children() {
            return props.children;
          }
        }));
        return _el$;
      })(), createComponent(Show, {
        get when() {
          return activeItem();
        },
        keyed: true,
        get children() {
          return createComponent(DragOverlay, {
            get children() {
              return props.overlay_child?.({
                id: activeItem()
              }) ?? void 0;
            }
          });
        }
      })];
    }
  });
}
function ConstrainVerticalDrag() {
  const DragCTX = useDragDropContext()?.[1];
  if (DragCTX === void 0) return;
  const {
    onDragStart,
    onDragEnd,
    addTransformer,
    removeTransformer
  } = DragCTX;
  const CONSTRAIN_X = {
    id: "constrain-x-axis",
    order: 100,
    callback: transform => ({
      ...transform,
      x: 0
    })
  };
  onDragStart(({
    draggable
  }) => {
    addTransformer("draggables", draggable.id, CONSTRAIN_X);
  });
  onDragEnd(({
    draggable
  }) => {
    removeTransformer("draggables", draggable.id, CONSTRAIN_X.id);
  });
  return [];
}
function SelectableItemTag(props) {
  const sortable = createSortable(props.tag_id());
  const state = useDragDropContext()?.[0];
  const [, divProps] = splitProps(props, ["tag_id", "tag_name"]);
  return (() => {
    var _el$2 = _tmpl$2$g(),
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.nextSibling;
    use(sortable, _el$2, () => true);
    spread(_el$2, mergeProps(divProps, {
      get style() {
        return {
          "opacity": sortable.isActiveDraggable ? "25%" : void 0,
          "transition": state?.active.draggable ? "transform .15s ease-in-out" : void 0
        };
      }
    }), false, true);
    insert(_el$2, () => props.children, _el$4);
    createRenderEffect(_p$ => {
      var _v$ = props.tag_name(),
        _v$2 = "id: " + props.tag_id();
      _v$ !== _p$.e && (_el$3.innerText = _p$.e = _v$);
      _v$2 !== _p$.t && (_el$4.innerText = _p$.t = _v$2);
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$2;
  })();
}
function OverlayItemTag(props) {
  const [, divProps] = splitProps(props, ["tag_id", "tag_name"]);
  return (() => {
    var _el$5 = _tmpl$3$8(),
      _el$6 = _el$5.firstChild,
      _el$7 = _el$6.nextSibling;
    spread(_el$5, divProps, false, true);
    insert(_el$5, () => props.children, _el$7);
    createRenderEffect(_p$ => {
      var _v$3 = props.tag_name(),
        _v$4 = "id: " + props.tag_id();
      _v$3 !== _p$.e && (_el$6.innerText = _p$.e = _v$3);
      _v$4 !== _p$.t && (_el$7.innerText = _p$.t = _v$4);
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$5;
  })();
}

var _tmpl$$l = /* @__PURE__ */template(`<div class=object_tree_title> Object Tree `),
  _tmpl$2$f = /* @__PURE__ */template(`<div class=object_tree>`),
  _tmpl$3$7 = /* @__PURE__ */template(`<div class=drop_down_selector>`),
  _tmpl$4$7 = /* @__PURE__ */template(`<div class=reorderable_set><div><div class="text branch_title">`),
  _tmpl$5$6 = /* @__PURE__ */template(`<div class="orderable text">`);
const MIN_WIDTH$1 = 156;
const MAX_WIDTH$1 = 468;
const DEFAULT_WIDTH$1 = 250;
const ORDERABLE = Symbol("Orderable");
const ORDERABLE_SET = Symbol("OrderableSet");
function isOrderable(obj) {
  return obj !== null && typeof obj === "object" && ORDERABLE in obj;
}
function isReorderableSet(obj) {
  return obj !== null && typeof obj === "object" && ORDERABLE in obj && ORDERABLE_SET in obj;
}
const default_tree_props = {
  mainBranch: () => NULL_TREE_BRANCH_INTERFACE,
  setMainBranch: () => void 0
};
let TreeContext = createContext(default_tree_props);
function ObjectTreeCTX() {
  return useContext(TreeContext);
}
function ObjTreeContext(props) {
  const branchProps = createSignal(NULL_TREE_BRANCH_INTERFACE);
  const ObjTreeCTX = {
    mainBranch: branchProps[0],
    setMainBranch: branchProps[1]
  };
  TreeContext = createContext(ObjTreeCTX);
  return createComponent(TreeContext.Provider, {
    value: ObjTreeCTX,
    get children() {
      return props.children;
    }
  });
}
const NULL_TREE_BRANCH_INTERFACE = {
  id: "",
  branchTitle: "",
  dropDownMode: "auto",
  moveTo: () => void 0,
  reorder: () => void 0,
  reorderables: () => []
};
function ObjectTree() {
  const ctx = ObjectTreeCTX();
  onMount(() => {
    WidgetPanelSizeCTX().setMinSize(MIN_WIDTH$1);
    WidgetPanelSizeCTX().setMaxSize(MAX_WIDTH$1);
    WidgetPanelSizeCTX().setSize(DEFAULT_WIDTH$1);
  });
  return [_tmpl$$l(), (() => {
    var _el$2 = _tmpl$2$f();
    insert(_el$2, createComponent(DragDropProvider, {
      onDragEnd: handleDrag,
      collisionDetector: closestCenter,
      get children() {
        return [createComponent(DragDropSensors, {}), createComponent(ConstrainVerticalDrag, {}), createComponent(OrderableSet, mergeProps(() => ctx.mainBranch(), {
          get set_id() {
            return ctx.mainBranch().id + "_set";
          }
        }))];
      }
    }));
    return _el$2;
  })()];
}
function OrderableSet(props) {
  const [ids, setIds] = createSignal([]);
  createEffect(() => {
    setIds(Array.from(props.reorderables(), obj => obj.id));
  });
  return createComponent(SortableProvider, {
    get ids() {
      return ids();
    },
    get children() {
      return createComponent(For, {
        get each() {
          return props.reorderables();
        },
        children: obj => {
          if (isReorderableSet(obj)) return createComponent(ReorderableSet, mergeProps(() => obj.branchProps, {
            obj,
            get set_id() {
              return props.set_id;
            },
            parent: props
          }));else if (isOrderable(obj)) return createComponent(Orderable, mergeProps(() => obj.leafProps, {
            obj,
            get set_id() {
              return props.set_id;
            },
            parent: props
          }));else return void 0;
        }
      });
    }
  });
}
function ReorderableSet(props) {
  const [dropDown, setDropDown] = createSignal(props.dropDownMode !== "toggleable");
  const [data] = splitProps(props, ["id", "obj", "set_id", "moveTo", "reorder", "parent"]);
  const state = useDragDropContext()?.[0];
  const sortable = createSortable(props.id, data);
  return (() => {
    var _el$3 = _tmpl$4$7(),
      _el$4 = _el$3.firstChild,
      _el$5 = _el$4.firstChild;
    var _ref$ = sortable.ref;
    typeof _ref$ === "function" ? use(_ref$, _el$3) : sortable.ref = _el$3;
    spread(_el$4, mergeProps(() => sortable.dragActivators, {
      "class": "orderable_set_header",
      get onclick() {
        return handleLeftClick.bind(void 0, props.obj.leafProps);
      },
      get oncontextmenu() {
        return handleRightClick.bind(void 0, props.obj.leafProps);
      }
    }), false, true);
    insert(_el$4, createComponent(Show, {
      get when() {
        return props.dropDownMode === "toggleable";
      },
      get children() {
        var _el$6 = _tmpl$3$7();
        _el$6.$$click = () => setDropDown(!dropDown());
        insert(_el$6, createComponent(Icon, {
          get icon() {
            return icons.menu_arrow_ns;
          },
          get style() {
            return {
              rotate: dropDown() ? "180deg" : "0deg"
            };
          }
        }));
        return _el$6;
      }
    }), null);
    insert(_el$3, createComponent(Show, {
      get when() {
        return dropDown();
      },
      get children() {
        return createComponent(OrderableSet, mergeProps(() => props.obj.branchProps, {
          get set_id() {
            return props.obj.branchProps.id + "_set";
          }
        }));
      }
    }), null);
    createRenderEffect(_p$ => {
      var _v$ = {
          ...transformStyle(sortable.transform),
          "opacity": sortable.isActiveDraggable ? "100" : void 0,
          "transition": state?.active.draggable ? "transform .025s ease-in-out" : void 0
        },
        _v$2 = props.branchTitle;
      _p$.e = style(_el$3, _v$, _p$.e);
      _v$2 !== _p$.t && (_el$5.innerText = _p$.t = _v$2);
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$3;
  })();
}
function Orderable(props) {
  const sortable = createSortable(props.id, {
    "id": props.id,
    "obj": props.obj,
    "set_id": props.set_id,
    "parent": props.parent
  });
  const state = useDragDropContext()?.[0];
  return (() => {
    var _el$7 = _tmpl$5$6();
    addEventListener(_el$7, "contextmenu", handleRightClick.bind(void 0, props), true);
    addEventListener(_el$7, "click", handleLeftClick.bind(void 0, props), true);
    use(sortable, _el$7, () => true);
    createRenderEffect(_p$ => {
      var _v$3 = props.leafTitle,
        _v$4 = sortable.isActiveDraggable ? "100" : void 0,
        _v$5 = state?.active.draggable ? "transform .025s ease-in-out" : void 0;
      _v$3 !== _p$.e && (_el$7.innerText = _p$.e = _v$3);
      _v$4 !== _p$.t && ((_p$.t = _v$4) != null ? _el$7.style.setProperty("opacity", _v$4) : _el$7.style.removeProperty("opacity"));
      _v$5 !== _p$.a && ((_p$.a = _v$5) != null ? _el$7.style.setProperty("transition", _v$5) : _el$7.style.removeProperty("transition"));
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0
    });
    return _el$7;
  })();
}
function handleDrag({
  draggable,
  droppable
}) {
  if (draggable === void 0 || droppable === void 0) return;
  if (draggable.data?.set_id == droppable.data?.set_id) {
    console.log("same group : Reorder");
    droppable.data?.parent?.reorder(draggable.data?.obj, droppable.data?.obj);
  } else {
    console.log("different group. Move to Parent");
    droppable.data?.moveToFunc?.(draggable.data?.obj);
  }
}
function handleRightClick(obj, e) {
  e.preventDefault();
  if (e.button == 2 && obj.onRightClick) {
    e.stopPropagation();
    obj.onRightClick(e);
  }
}
function handleLeftClick(obj, e) {
  if (e.button == 0 && obj.onLeftClick) {
    e.stopPropagation();
    obj.onLeftClick(e);
  }
}
delegateEvents(["click", "contextmenu"]);

const HALF_WIDTH = 4;
const RESIZE_HANDLE_WIDTH = 8;
const default_layout_constants = {
  MIN_FRAME_WIDTH: 0.15,
  MIN_FRAME_HEIGHT: 0.1
};
var Orientation = /* @__PURE__ */(Orientation2 => {
  Orientation2[Orientation2["Horizontal"] = 0] = "Horizontal";
  Orientation2[Orientation2["Vertical"] = 1] = "Vertical";
  Orientation2[Orientation2["null"] = 2] = "null";
  return Orientation2;
})(Orientation || {});
var Container_Layouts = /* @__PURE__ */(Container_Layouts2 => {
  Container_Layouts2[Container_Layouts2["SINGLE"] = 0] = "SINGLE";
  Container_Layouts2[Container_Layouts2["DOUBLE_VERT"] = 1] = "DOUBLE_VERT";
  Container_Layouts2[Container_Layouts2["DOUBLE_HORIZ"] = 2] = "DOUBLE_HORIZ";
  Container_Layouts2[Container_Layouts2["TRIPLE_VERT"] = 3] = "TRIPLE_VERT";
  Container_Layouts2[Container_Layouts2["TRIPLE_VERT_LEFT"] = 4] = "TRIPLE_VERT_LEFT";
  Container_Layouts2[Container_Layouts2["TRIPLE_VERT_RIGHT"] = 5] = "TRIPLE_VERT_RIGHT";
  Container_Layouts2[Container_Layouts2["TRIPLE_HORIZ"] = 6] = "TRIPLE_HORIZ";
  Container_Layouts2[Container_Layouts2["TRIPLE_HORIZ_TOP"] = 7] = "TRIPLE_HORIZ_TOP";
  Container_Layouts2[Container_Layouts2["TRIPLE_HORIZ_BOTTOM"] = 8] = "TRIPLE_HORIZ_BOTTOM";
  Container_Layouts2[Container_Layouts2["QUAD_SQ_V"] = 9] = "QUAD_SQ_V";
  Container_Layouts2[Container_Layouts2["QUAD_SQ_H"] = 10] = "QUAD_SQ_H";
  Container_Layouts2[Container_Layouts2["QUAD_VERT"] = 11] = "QUAD_VERT";
  Container_Layouts2[Container_Layouts2["QUAD_HORIZ"] = 12] = "QUAD_HORIZ";
  Container_Layouts2[Container_Layouts2["QUAD_LEFT"] = 13] = "QUAD_LEFT";
  Container_Layouts2[Container_Layouts2["QUAD_RIGHT"] = 14] = "QUAD_RIGHT";
  Container_Layouts2[Container_Layouts2["QUAD_TOP"] = 15] = "QUAD_TOP";
  Container_Layouts2[Container_Layouts2["QUAD_BOTTOM"] = 16] = "QUAD_BOTTOM";
  return Container_Layouts2;
})(Container_Layouts || {});
function num_frames(layout) {
  switch (layout) {
    case 0 /* SINGLE */:
      return 1;
    case 1 /* DOUBLE_VERT */:
      return 2;
    case 2 /* DOUBLE_HORIZ */:
      return 2;
    case 3 /* TRIPLE_VERT */:
      return 3;
    case 4 /* TRIPLE_VERT_LEFT */:
      return 3;
    case 5 /* TRIPLE_VERT_RIGHT */:
      return 3;
    case 6 /* TRIPLE_HORIZ */:
      return 3;
    case 7 /* TRIPLE_HORIZ_TOP */:
      return 3;
    case 8 /* TRIPLE_HORIZ_BOTTOM */:
      return 3;
    case 9 /* QUAD_SQ_V */:
      return 4;
    case 10 /* QUAD_SQ_H */:
      return 4;
    case 11 /* QUAD_VERT */:
      return 4;
    case 12 /* QUAD_HORIZ */:
      return 4;
    case 13 /* QUAD_LEFT */:
      return 4;
    case 14 /* QUAD_RIGHT */:
      return 4;
    case 15 /* QUAD_TOP */:
      return 4;
    case 16 /* QUAD_BOTTOM */:
      return 4;
    default:
      return 0;
  }
}
function widget_section(flex_width, flex_height) {
  let new_section = {
    rect: {
      top: 0,
      left: 0,
      width: 0,
      height: 0
    },
    style: "",
    mouseDown: () => {},
    flex_width,
    flex_height,
    orientation: 2 /* null */,
    resize_pos: [],
    resize_neg: []
  };
  return new_section;
}
function separator_section(type, size, divRect, resize, layout_params) {
  let new_section = {
    rect: {
      top: 0,
      left: 0,
      width: 0,
      height: 0
    },
    style: "",
    mouseDown: () => {},
    flex_height: type === 1 /* Vertical */ ? size : 0,
    flex_width: type === 0 /* Horizontal */ ? size : 0,
    orientation: type,
    resize_pos: [],
    resize_neg: []
  };
  let resize_partial_func;
  if (type === 1 /* Vertical */) resize_partial_func = resize_flex_horizontal.bind(void 0, layout_params.MIN_FRAME_WIDTH, divRect, resize, new_section);else resize_partial_func = resize_flex_vertical.bind(void 0, layout_params.MIN_FRAME_HEIGHT, divRect, resize, new_section);
  const mouseup = () => {
    document.removeEventListener("mousemove", resize_partial_func);
    document.removeEventListener("mouseup", mouseup);
  };
  new_section.mouseDown = () => {
    document.addEventListener("mousemove", resize_partial_func);
    document.addEventListener("mouseup", mouseup);
  };
  return new_section;
}
function resize_flex_horizontal(MIN_SIZE, divRect, resize, separator, e) {
  let flex_total = separator.resize_pos[0].flex_width + separator.resize_neg[0].flex_width;
  let width_total = separator.resize_pos[0].rect.width + separator.resize_neg[0].rect.width;
  let relative_x = e.clientX - (divRect().left + (separator.resize_pos[0]?.rect.left ?? 0));
  let flex_size_left = relative_x / width_total * flex_total;
  let flex_size_right = flex_total - flex_size_left;
  if (flex_size_left < MIN_SIZE) {
    flex_size_left = MIN_SIZE;
    flex_size_right = flex_total - flex_size_left;
  } else if (flex_size_right < MIN_SIZE) {
    flex_size_right = MIN_SIZE;
    flex_size_left = flex_total - flex_size_right;
  }
  separator.resize_pos.forEach(section => {
    section.flex_width = flex_size_left;
  });
  separator.resize_neg.forEach(section => {
    section.flex_width = flex_size_right;
  });
  resize();
}
function resize_flex_vertical(MIN_SIZE, divRect, resize, separator, e) {
  let flex_total = separator.resize_pos[0].flex_height + separator.resize_neg[0].flex_height;
  let height_total = separator.resize_pos[0].rect.height + separator.resize_neg[0].rect.height;
  let container_y = e.clientY - (divRect().top + (separator.resize_pos[0]?.rect.top ?? 0));
  let flex_size_top = container_y / height_total * flex_total;
  let flex_size_bottom = flex_total - flex_size_top;
  if (flex_size_top < MIN_SIZE) {
    flex_size_top = MIN_SIZE;
    flex_size_bottom = flex_total - flex_size_top;
  } else if (flex_size_bottom < MIN_SIZE) {
    flex_size_bottom = MIN_SIZE;
    flex_size_top = flex_total - flex_size_bottom;
  }
  separator.resize_pos.forEach(section => {
    section.flex_height = flex_size_top;
  });
  separator.resize_neg.forEach(section => {
    section.flex_height = flex_size_bottom;
  });
  resize();
}
function resize_sections(divRect, frames) {
  let width = divRect().width;
  let height = divRect().height;
  if (width <= 0 || height <= 0) return;
  frames.forEach((section, i) => {
    let new_rect, top, left;
    if (section.orientation === 1 /* Vertical */) {
      let ref_rect = section.resize_pos[0]?.rect;
      top = ref_rect?.top;
      left = ref_rect?.left + ref_rect?.width;
      new_rect = {
        top: top ?? 0,
        left: left ?? 0,
        width: RESIZE_HANDLE_WIDTH,
        height: Math.round(height * section.flex_height)
      };
      frames[i].style = `{top:${new_rect.top}px; left:${new_rect.left - HALF_WIDTH}px; width:${new_rect.width}px; height:${new_rect.height}px}`;
    } else if (section.orientation === 0 /* Horizontal */) {
      let ref_rect = section.resize_pos[0]?.rect;
      top = ref_rect?.top + ref_rect?.height;
      left = ref_rect?.left;
      new_rect = {
        top: top ?? 0,
        left: left ?? 0,
        width: Math.round(width * section.flex_width),
        height: RESIZE_HANDLE_WIDTH
      };
      frames[i].style = `{top:${new_rect.top - HALF_WIDTH}px; left:${new_rect.left}px; width:${new_rect.width}px; height:${new_rect.height}px}`;
    } else {
      if (section.resize_pos[0]?.orientation === 0 /* Horizontal */) {
        top = section.resize_pos[0]?.rect.top;
        left = section.resize_pos[1]?.rect.left;
      } else {
        top = section.resize_pos[1]?.rect.top;
        left = section.resize_pos[0]?.rect.left;
      }
      new_rect = {
        top: top ?? 0,
        left: left ?? 0,
        width: Math.round(width * section.flex_width),
        height: Math.round(height * section.flex_height)
      };
      frames[i].style = `{top:${new_rect.top}px; left:${new_rect.left}px; width:${new_rect.width}px; height:${new_rect.height}px}`;
    }
    frames[i].rect = new_rect;
  });
}
function layout_switch(layout, divRect, resize, layout_params = default_layout_constants) {
  switch (layout) {
    case 1 /* DOUBLE_VERT */:
      {
        let f1 = widget_section(0.5, 1);
        let s1 = separator_section(1 /* Vertical */, 1, divRect, resize, layout_params);
        let f2 = widget_section(0.5, 1);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2);
        f2.resize_pos.push(s1);
        return [f1, s1, f2];
      }
    case 2 /* DOUBLE_HORIZ */:
      {
        let f1 = widget_section(1, 0.5);
        let s1 = separator_section(0 /* Horizontal */, 1, divRect, resize, layout_params);
        let f2 = widget_section(1, 0.5);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2);
        f2.resize_pos.push(s1);
        return [f1, s1, f2];
      }
    case 3 /* TRIPLE_VERT */:
      {
        let f1 = widget_section(0.333, 1);
        let s1 = separator_section(1 /* Vertical */, 1, divRect, resize, layout_params);
        let f2 = widget_section(0.333, 1);
        let s2 = separator_section(1 /* Vertical */, 1, divRect, resize, layout_params);
        let f3 = widget_section(0.333, 1);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2);
        s2.resize_pos.push(f2);
        s2.resize_neg.push(f3);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s2);
        return [f1, s1, f2, s2, f3];
      }
    case 4 /* TRIPLE_VERT_LEFT */:
      {
        let f1 = widget_section(0.5, 1);
        let s1 = separator_section(1 /* Vertical */, 1, divRect, resize, layout_params);
        let f2 = widget_section(0.5, 0.5);
        let s2 = separator_section(0 /* Horizontal */, 0.5, divRect, resize, layout_params);
        let f3 = widget_section(0.5, 0.5);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2, f3, s2);
        s2.resize_pos.push(f2);
        s2.resize_neg.push(f3);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s1, s2);
        return [f1, s1, f2, s2, f3];
      }
    case 5 /* TRIPLE_VERT_RIGHT */:
      {
        let f1 = widget_section(0.5, 0.5);
        let s1 = separator_section(0 /* Horizontal */, 0.5, divRect, resize, layout_params);
        let f2 = widget_section(0.5, 0.5);
        let s2 = separator_section(1 /* Vertical */, 1, divRect, resize, layout_params);
        let f3 = widget_section(0.5, 1);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2);
        s2.resize_pos.push(f1, f2, s1);
        s2.resize_neg.push(f3);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s2);
        return [f1, s1, f2, s2, f3];
      }
    case 6 /* TRIPLE_HORIZ */:
      {
        let f1 = widget_section(1, 0.333);
        let s1 = separator_section(0 /* Horizontal */, 1, divRect, resize, layout_params);
        let f2 = widget_section(1, 0.333);
        let s2 = separator_section(0 /* Horizontal */, 1, divRect, resize, layout_params);
        let f3 = widget_section(1, 0.333);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2);
        s2.resize_pos.push(f2);
        s2.resize_neg.push(f3);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s2);
        return [f1, s1, f2, s2, f3];
      }
    case 7 /* TRIPLE_HORIZ_TOP */:
      {
        let f1 = widget_section(1, 0.5);
        let s1 = separator_section(0 /* Horizontal */, 1, divRect, resize, layout_params);
        let f2 = widget_section(0.5, 0.5);
        let s2 = separator_section(1 /* Vertical */, 0.5, divRect, resize, layout_params);
        let f3 = widget_section(0.5, 0.5);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2, f3, s2);
        s2.resize_pos.push(f2);
        s2.resize_neg.push(f3);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s1, s2);
        return [f1, s1, f2, s2, f3];
      }
    case 8 /* TRIPLE_HORIZ_BOTTOM */:
      {
        let f1 = widget_section(0.5, 0.5);
        let s1 = separator_section(1 /* Vertical */, 0.5, divRect, resize, layout_params);
        let f2 = widget_section(0.5, 0.5);
        let s2 = separator_section(0 /* Horizontal */, 1, divRect, resize, layout_params);
        let f3 = widget_section(1, 0.5);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2);
        s2.resize_pos.push(f1, f2, s1);
        s2.resize_neg.push(f3);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s2);
        return [f1, s1, f2, s2, f3];
      }
    case 10 /* QUAD_SQ_H */:
      {
        let f1 = widget_section(0.5, 0.5);
        let s1 = separator_section(1 /* Vertical */, 0.5, divRect, resize, layout_params);
        let f2 = widget_section(0.5, 0.5);
        let s2 = separator_section(0 /* Horizontal */, 1, divRect, resize, layout_params);
        let f3 = widget_section(0.5, 0.5);
        let s3 = separator_section(1 /* Vertical */, 0.5, divRect, resize, layout_params);
        let f4 = widget_section(0.5, 0.5);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2);
        s3.resize_pos.push(f3);
        s3.resize_neg.push(f4);
        s2.resize_pos.push(f1, f2, s1);
        s2.resize_neg.push(f3, f4, s3);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s2);
        f4.resize_pos.push(s2, s3);
        return [f1, s1, f2, s2, f3, s3, f4];
      }
    case 9 /* QUAD_SQ_V */:
      {
        let f1 = widget_section(0.5, 0.5);
        let s1 = separator_section(0 /* Horizontal */, 0.5, divRect, resize, layout_params);
        let f2 = widget_section(0.5, 0.5);
        let s2 = separator_section(1 /* Vertical */, 1, divRect, resize, layout_params);
        let f3 = widget_section(0.5, 0.5);
        let s3 = separator_section(0 /* Horizontal */, 0.5, divRect, resize, layout_params);
        let f4 = widget_section(0.5, 0.5);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2);
        s3.resize_pos.push(f3);
        s3.resize_neg.push(f4);
        s2.resize_pos.push(f1, f2, s1);
        s2.resize_neg.push(f3, f4, s3);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s2);
        f4.resize_pos.push(s2, s3);
        return [f1, s1, f2, s2, f3, s3, f4];
      }
    case 11 /* QUAD_VERT */:
      {
        let f1 = widget_section(0.25, 1);
        let s1 = separator_section(1 /* Vertical */, 1, divRect, resize, layout_params);
        let f2 = widget_section(0.25, 1);
        let s2 = separator_section(1 /* Vertical */, 1, divRect, resize, layout_params);
        let f3 = widget_section(0.25, 1);
        let s3 = separator_section(1 /* Vertical */, 1, divRect, resize, layout_params);
        let f4 = widget_section(0.25, 1);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2);
        s2.resize_pos.push(f2);
        s2.resize_neg.push(f3);
        s3.resize_pos.push(f3);
        s3.resize_neg.push(f4);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s2);
        f4.resize_pos.push(s3);
        return [f1, s1, f2, s2, f3, s3, f4];
      }
    case 12 /* QUAD_HORIZ */:
      {
        let f1 = widget_section(1, 0.25);
        let s1 = separator_section(0 /* Horizontal */, 1, divRect, resize, layout_params);
        let f2 = widget_section(1, 0.25);
        let s2 = separator_section(0 /* Horizontal */, 1, divRect, resize, layout_params);
        let f3 = widget_section(1, 0.25);
        let s3 = separator_section(0 /* Horizontal */, 1, divRect, resize, layout_params);
        let f4 = widget_section(1, 0.25);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2);
        s2.resize_pos.push(f2);
        s2.resize_neg.push(f3);
        s3.resize_pos.push(f3);
        s3.resize_neg.push(f4);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s2);
        f4.resize_pos.push(s3);
        return [f1, s1, f2, s2, f3, s3, f4];
      }
    case 13 /* QUAD_LEFT */:
      {
        let f1 = widget_section(0.5, 1);
        let s1 = separator_section(1 /* Vertical */, 1, divRect, resize, layout_params);
        let f2 = widget_section(0.5, 0.333);
        let s2 = separator_section(0 /* Horizontal */, 0.5, divRect, resize, layout_params);
        let f3 = widget_section(0.5, 0.333);
        let s3 = separator_section(0 /* Horizontal */, 0.5, divRect, resize, layout_params);
        let f4 = widget_section(0.5, 0.333);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2, f3, f4, s2, s3);
        s2.resize_pos.push(f2);
        s2.resize_neg.push(f3);
        s3.resize_pos.push(f3);
        s3.resize_neg.push(f4);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s1, s2);
        f4.resize_pos.push(s1, s3);
        return [f1, s1, f2, s2, f3, s3, f4];
      }
    case 14 /* QUAD_RIGHT */:
      {
        let f1 = widget_section(0.5, 0.333);
        let s1 = separator_section(0 /* Horizontal */, 0.5, divRect, resize, layout_params);
        let f2 = widget_section(0.5, 0.333);
        let s2 = separator_section(0 /* Horizontal */, 0.5, divRect, resize, layout_params);
        let f3 = widget_section(0.5, 0.333);
        let s3 = separator_section(1 /* Vertical */, 1, divRect, resize, layout_params);
        let f4 = widget_section(0.5, 1);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2);
        s2.resize_pos.push(f2);
        s2.resize_neg.push(f3);
        s3.resize_pos.push(f1, f2, f3, s1, s2);
        s3.resize_neg.push(f4);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s2);
        f4.resize_pos.push(s3);
        return [f1, s1, f2, s2, f3, s3, f4];
      }
    case 15 /* QUAD_TOP */:
      {
        let f1 = widget_section(1, 0.5);
        let s1 = separator_section(0 /* Horizontal */, 1, divRect, resize, layout_params);
        let f2 = widget_section(0.333, 0.5);
        let s2 = separator_section(1 /* Vertical */, 0.5, divRect, resize, layout_params);
        let f3 = widget_section(0.333, 0.5);
        let s3 = separator_section(1 /* Vertical */, 0.5, divRect, resize, layout_params);
        let f4 = widget_section(0.333, 0.5);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2, f3, f4, s2, s3);
        s2.resize_pos.push(f2);
        s2.resize_neg.push(f3);
        s3.resize_pos.push(f3);
        s3.resize_neg.push(f4);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s1, s2);
        f4.resize_pos.push(s1, s3);
        return [f1, s1, f2, s2, f3, s3, f4];
      }
    case 16 /* QUAD_BOTTOM */:
      {
        let f1 = widget_section(0.333, 0.5);
        let s1 = separator_section(1 /* Vertical */, 0.5, divRect, resize, layout_params);
        let f2 = widget_section(0.333, 0.5);
        let s2 = separator_section(1 /* Vertical */, 0.5, divRect, resize, layout_params);
        let f3 = widget_section(0.333, 0.5);
        let s3 = separator_section(0 /* Horizontal */, 1, divRect, resize, layout_params);
        let f4 = widget_section(1, 0.5);
        s1.resize_pos.push(f1);
        s1.resize_neg.push(f2);
        s2.resize_pos.push(f2);
        s2.resize_neg.push(f3);
        s3.resize_pos.push(f1, f2, f3, s1, s2);
        s3.resize_neg.push(f4);
        f2.resize_pos.push(s1);
        f3.resize_pos.push(s2);
        f4.resize_pos.push(s3);
        return [f1, s1, f2, s2, f3, s3, f4];
      }
    default:
      return [widget_section(1, 1)];
  }
}

var _tmpl$$k = /* @__PURE__ */template(`<style>`),
  _tmpl$2$e = /* @__PURE__ */template(`<div>`);
const default_layout_ctx_args = {
  getSize: () => {
    return new DOMRect(0, 0, -1, -1);
  },
  setStyle: () => {},
  displays: () => [],
  setDisplay: () => {}
};
function Layout(props) {
  return [(() => {
    var _el$ = _tmpl$$k();
    createRenderEffect(() => _el$.innerHTML = props.innerStyle());
    return _el$;
  })(), createComponent(For, {
    get each() {
      return props.displays();
    },
    children: display => (() => {
      var _el$2 = _tmpl$2$e();
      addEventListener(_el$2, "mousedown", display.mouseDown, true);
      insert(_el$2, () => display.element);
      createRenderEffect(_p$ => {
        var _v$ = display.orientation === Orientation.Vertical ? "separator_v" : display.orientation === Orientation.Horizontal ? "separator_h" : void 0,
          _v$2 = props.select_cls,
          _v$3 = display.el_active() ? "" : void 0,
          _v$4 = display.el_target() ? "" : void 0;
        _v$ !== _p$.e && setAttribute(_el$2, "id", _p$.e = _v$);
        _v$2 !== _p$.t && className(_el$2, _p$.t = _v$2);
        _v$3 !== _p$.a && setAttribute(_el$2, "active", _p$.a = _v$3);
        _v$4 !== _p$.o && setAttribute(_el$2, "target", _p$.o = _v$4);
        return _p$;
      }, {
        e: void 0,
        t: void 0,
        a: void 0,
        o: void 0
      });
      return _el$2;
    })()
  })];
}
delegateEvents(["mousedown"]);

var _tmpl$$j = /* @__PURE__ */template(`<div id=container class=layout_main>`);
let ContainerContext = createContext(default_layout_ctx_args);
function ContainerCTX() {
  return useContext(ContainerContext);
}
function Container(props) {
  const [divRef, setDivRef] = createSignal(document.createElement("div"));
  const [style$1, setStyle] = createSignal("");
  const [displays, setDisplays] = createSignal([]);
  const getSize = () => {
    return divRef().getBoundingClientRect();
  };
  const ctx_args = {
    getSize,
    setStyle,
    displays,
    setDisplay: setDisplays
  };
  ContainerContext = createContext(ctx_args);
  return createComponent(ContainerContext.Provider, {
    value: ctx_args,
    get children() {
      var _el$ = _tmpl$$j();
      use(setDivRef, _el$);
      insert(_el$, createComponent(Layout, {
        select_cls: "frame",
        innerStyle: style$1,
        displays
      }));
      createRenderEffect(_$p => style(_el$, props.style, _$p));
      return _el$;
    }
  });
}

var _tmpl$$i = /* @__PURE__ */template(`<div id=overlay_manager>`),
  _tmpl$2$d = /* @__PURE__ */template(`<div>`);
const default_ctx_args = {
  attachOverlay: () => {},
  detachOverlay: () => {},
  getDivReference: () => {
    return void 0;
  },
  setDivReference: () => {},
  getDisplaySetter: () => () => {},
  getDisplayAccessor: () => () => false
};
let OverlayContext = createContext(default_ctx_args);
function OverlayCTX() {
  return useContext(OverlayContext);
}
function OverlayContextProvider(props) {
  const [overlays, setOverlays] = createStore([]);
  const displayMap = /* @__PURE__ */new Map();
  const divMap = /* @__PURE__ */new Map();
  function attachOverlay(id, el, ShowDisplay = void 0, autohide = true) {
    if (overlays.find(obj => obj.id === id)) setOverlays(Array.from(overlays.filter(obj => obj.id !== id)));
    if (ShowDisplay === void 0) ShowDisplay = createSignal(false);
    displayMap.set(id, ShowDisplay);
    if (typeof el === "function") el = el();
    setOverlays([...overlays, {
      id,
      el,
      hide: autohide
    }]);
  }
  function detachOverlay(id) {
    divMap.delete(id);
    displayMap.delete(id);
    setOverlays(overlays.filter(overlay => overlay.id !== id));
  }
  function getDivReference(id) {
    return divMap.get(id);
  }
  function setDivReference(id, el) {
    divMap.set(id, el);
  }
  function getDisplayAccessor(id) {
    const display = displayMap.get(id);
    return display !== void 0 ? display[0] : () => false;
  }
  function getDisplaySetter(id) {
    const display = displayMap.get(id);
    return display !== void 0 ? display[1] : () => void 0;
  }
  document.body.addEventListener("mousedown", e => overlays.forEach(({
    id,
    hide
  }) => {
    if (!hide) return;
    let el = getDivReference(id);
    if (el && !el.contains(e.target)) getDisplaySetter(id)(false);
  }));
  document.body.addEventListener("keydown", e => {
    if (e.key === "Escape") Array.from(overlays).forEach(({
      id,
      hide
    }) => {
      if (hide !== null) getDisplaySetter(id)(false);
    });
  });
  const OverlayCTX2 = {
    attachOverlay,
    detachOverlay,
    getDivReference,
    setDivReference,
    getDisplaySetter,
    getDisplayAccessor
  };
  OverlayContext = createContext(OverlayCTX2);
  return createComponent(OverlayContext.Provider, {
    value: OverlayCTX2,
    get children() {
      return [memo(() => props.children), (() => {
        var _el$ = _tmpl$$i();
        insert(_el$, createComponent(For, {
          each: overlays,
          children: ({
            id,
            el
          }) => {
            return createComponent(Show, {
              get when() {
                return getDisplayAccessor(id)();
              },
              children: el
            });
          }
        }));
        return _el$;
      })()];
    }
  });
}
var location_reference = /* @__PURE__ */(location_reference2 => {
  location_reference2[location_reference2["TOP_RIGHT"] = 0] = "TOP_RIGHT";
  location_reference2[location_reference2["TOP_LEFT"] = 1] = "TOP_LEFT";
  location_reference2[location_reference2["BOTTOM_RIGHT"] = 2] = "BOTTOM_RIGHT";
  location_reference2[location_reference2["BOTTOM_LEFT"] = 3] = "BOTTOM_LEFT";
  location_reference2[location_reference2["CENTER"] = 4] = "CENTER";
  return location_reference2;
})(location_reference || {});
function OverlayDiv(props) {
  let divRef = void 0;
  let boundingClientRef = void 0;
  let dragListenerSet = !(props.drag_handle && props.setLocation);
  props.classList = {
    ...props.classList,
    overlay: true
  };
  const [style, setStyle] = createSignal(initPosition(props.location_ref, props.location()));
  const [, divProps] = splitProps(props, ["id", "location", "setLocation", "location_ref", "updateLocation", "drag_handle", "bounding_client_id", "oneshot"]);
  const move = e => {
    if (e.target !== document.documentElement) {
      if (props.setLocation) props.setLocation({
        x: props.location().x + e.movementX,
        y: props.location().y + e.movementY
      });
    }
  };
  const mouseup = e => {
    if (e.button !== 0) return;
    let div_ref = boundingClientRef ?? divRef;
    if (div_ref != void 0 && props.setLocation != void 0) {
      props.setLocation(getReferenceLocation(props.location_ref, div_ref.getBoundingClientRect()));
    }
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", mouseup);
  };
  let getBoundedPosition = getBoundedPositionFunc(props.location_ref);
  createEffect(() => {
    getBoundedPosition = getBoundedPositionFunc(props.location_ref);
  });
  onMount(() => {
    const display = OverlayCTX().getDisplayAccessor(props.id);
    createEffect(on$1(display, () => {
      if (!display()) return;
      divRef = document.querySelector(`#${props.id}`);
      if (props.bounding_client_id) boundingClientRef = document.querySelector(props.bounding_client_id);
      OverlayCTX().setDivReference(props.id, divRef);
      if (!dragListenerSet && props.drag_handle) {
        let drag_handle = document.querySelector(props.drag_handle);
        if (drag_handle) {
          drag_handle.addEventListener("mousedown", e => {
            if (e.button === 0) {
              document.addEventListener("mousemove", move);
              document.addEventListener("mouseup", mouseup);
            }
          });
          drag_handle.classList.add("drag_handle");
          dragListenerSet = true;
        }
      }
    }));
    createEffect(on$1(display, () => {
      if (props.oneshot && !display() && OverlayCTX().getDivReference(props.id)) OverlayCTX().detachOverlay(props.id);
    }));
    createEffect(() => {
      let ref = boundingClientRef ?? divRef;
      let pos = getBoundedPosition(props.location(), ref?.getBoundingClientRect());
      if (pos) setStyle(pos);
    });
    if (props.updateLocation) {
      createEffect(on$1(display, props.updateLocation));
      window.addEventListener("resize", props.updateLocation);
    }
  });
  onCleanup(() => {
    if (props.updateLocation) window.removeEventListener("resize", props.updateLocation);
  });
  return (() => {
    var _el$2 = _tmpl$2$d();
    spread(_el$2, mergeProps(divProps, {
      get id() {
        return props.id;
      },
      get style() {
        return style();
      }
    }), false, true);
    insert(_el$2, () => props.children);
    return _el$2;
  })();
}
function getBoundedPositionFunc(display_ref) {
  switch (display_ref) {
    case 1 /* TOP_LEFT */:
      return (pt, overlay_rect) => {
        const window_rect = document.querySelector("#overlay_manager")?.getBoundingClientRect();
        if (!window_rect || !overlay_rect) return;
        return {
          top: `${Math.round(Math.min(Math.max(pt.y, 0), window_rect.height - overlay_rect.height))}px`,
          left: `${Math.round(Math.min(Math.max(pt.x, 0), window_rect.width - overlay_rect.width))}px`
        };
      };
    case 3 /* BOTTOM_LEFT */:
      return (pt, overlay_rect) => {
        const window_rect = document.querySelector("#overlay_manager")?.getBoundingClientRect();
        if (!window_rect || !overlay_rect) return;
        return {
          bottom: `${Math.round(window_rect.height - Math.min(Math.max(pt.y, overlay_rect.height), window_rect.height))}px`,
          left: `${Math.round(Math.min(Math.max(pt.x, 0), window_rect.width - overlay_rect.width))}px`
        };
      };
    case 0 /* TOP_RIGHT */:
      return (pt, overlay_rect) => {
        const window_rect = document.querySelector("#overlay_manager")?.getBoundingClientRect();
        if (!window_rect || !overlay_rect) return;
        return {
          top: `${Math.round(Math.min(Math.max(pt.y, 0), window_rect.height - overlay_rect.height))}px`,
          right: `${Math.round(window_rect.width - Math.min(Math.max(pt.x, overlay_rect.width), window_rect.width))}px`
        };
      };
    case 2 /* BOTTOM_RIGHT */:
      return (pt, overlay_rect) => {
        const window_rect = document.querySelector("#overlay_manager")?.getBoundingClientRect();
        if (!window_rect || !overlay_rect) return;
        return {
          bottom: `${Math.round(window_rect.height - Math.min(Math.max(pt.y, overlay_rect.height), window_rect.height))}px`,
          right: `${Math.round(window_rect.width - Math.min(Math.max(pt.x, overlay_rect.width), window_rect.width))}px`
        };
      };
    case 4 /* CENTER */:
      return (pt, overlay_rect) => {
        const window_rect = document.querySelector("#overlay_manager")?.getBoundingClientRect();
        if (!window_rect || !overlay_rect) return;
        const left_offset = overlay_rect.width / 2;
        const top_offset = overlay_rect.height / 2;
        const right_bound = window_rect.width - overlay_rect.width;
        const bottom_bound = window_rect.height - overlay_rect.height;
        return {
          top: `${Math.round(Math.min(Math.max(pt.y - top_offset, 0), bottom_bound))}px`,
          left: `${Math.round(Math.min(Math.max(pt.x - left_offset, 0), right_bound))}px`
        };
      };
  }
}
function getReferenceLocation(display_ref, rect) {
  switch (display_ref) {
    case 1 /* TOP_LEFT */:
      return {
        x: rect.left,
        y: rect.top
      };
    case 3 /* BOTTOM_LEFT */:
      return {
        x: rect.left,
        y: rect.bottom
      };
    case 0 /* TOP_RIGHT */:
      return {
        x: rect.right,
        y: rect.top
      };
    case 2 /* BOTTOM_RIGHT */:
      return {
        x: rect.right,
        y: rect.bottom
      };
    case 4 /* CENTER */:
      return {
        x: rect.left + Math.floor(rect.width / 2),
        y: rect.top + Math.floor(rect.height / 2)
      };
  }
}
function initPosition(display_ref, pt) {
  const window_rect = {
    width: window.innerWidth,
    height: window.innerHeight
  };
  if (!window_rect) return {
    left: "-1px",
    top: "-1px"
  };
  switch (display_ref) {
    case 4 /* CENTER */:
    case 1 /* TOP_LEFT */:
      return {
        top: `${Math.round(Math.min(Math.max(pt.y, 0), window_rect.height))}px`,
        left: `${Math.round(Math.min(Math.max(pt.x, 0), window_rect.width))}px`
      };
    case 3 /* BOTTOM_LEFT */:
      return {
        bottom: `${Math.round(window_rect.height - Math.min(Math.max(pt.y, 0), window_rect.height))}px`,
        left: `${Math.round(Math.min(Math.max(pt.x, 0), window_rect.width))}px`
      };
    case 0 /* TOP_RIGHT */:
      return {
        top: `${Math.round(Math.min(Math.max(pt.y, 0), window_rect.height))}px`,
        right: `${Math.round(window_rect.width - Math.min(Math.max(pt.x, 0), window_rect.width))}px`
      };
    case 2 /* BOTTOM_RIGHT */:
      return {
        bottom: `${Math.round(window_rect.height - Math.min(Math.max(pt.y, 0), window_rect.height))}px`,
        right: `${Math.round(window_rect.width - Math.min(Math.max(pt.x, 0), window_rect.width))}px`
      };
  }
}

var _tmpl$$h = /* @__PURE__ */template(`<table>`),
  _tmpl$2$c = /* @__PURE__ */template(`<tr class=section_separator>`),
  _tmpl$3$6 = /* @__PURE__ */template(`<span class="text menu_item_shortcut">`),
  _tmpl$4$6 = /* @__PURE__ */template(`<tr class=context_menu_item><td> <div></div> </td><td><div><span class="text menu_item">`);
function MenuContextListener(e) {
  e.preventDefault();
  CONTEXT_MENU_CTX.display[1](true);
  CONTEXT_MENU_CTX.appendMenuItems(this);
}
const [menuItems, setMenuItems] = createSignal([]);
const [menuLocation, setMenuLocation] = createSignal({
  x: 0,
  y: 0
});
function appendMenuItems(items) {
  setMenuItems([...menuItems(), ...items]);
}
const CONTEXT_MENU_CTX = {
  display: createSignal(false),
  menuItems,
  setMenuItems,
  appendMenuItems,
  menuLocation,
  setMenuLocation
};
function ContextMenuOverlayProvider() {
  const id = "context_menu_overlay";
  OverlayCTX().attachOverlay(id, ContextMenu({
    id
  }), CONTEXT_MENU_CTX.display);
  return [];
}
function ContextMenu(props) {
  const CTX_RESET = e => {
    CONTEXT_MENU_CTX.display[1](true);
    CONTEXT_MENU_CTX.setMenuItems([]);
    CONTEXT_MENU_CTX.setMenuLocation({
      "x": e.clientX,
      "y": e.clientY
    });
  };
  const CTX_MENU_HIDE = () => {
    if (CONTEXT_MENU_CTX.menuItems().length == 0) CONTEXT_MENU_CTX.display[1](false);
  };
  onMount(() => {
    document.addEventListener("contextmenu", CTX_RESET, {
      capture: true
    });
    document.addEventListener("contextmenu", CTX_MENU_HIDE);
  });
  onCleanup(() => {
    document.removeEventListener("contextmenu", CTX_RESET);
    document.removeEventListener("contextmenu", CTX_MENU_HIDE);
  });
  return createComponent(OverlayDiv, {
    get id() {
      return props.id;
    },
    location: menuLocation,
    get location_ref() {
      return location_reference.TOP_LEFT;
    },
    get children() {
      var _el$ = _tmpl$$h();
      insert(_el$, createComponent(For, {
        get each() {
          return CONTEXT_MENU_CTX.menuItems();
        },
        children: subgroup => [createComponent(For, {
          each: subgroup,
          children: item => createComponent(ContextMenuItem, item)
        }), _tmpl$2$c()]
      }));
      return _el$;
    }
  });
}
function ContextMenuItem(props) {
  const isDisabled = props.disable && props.disable();
  const handleClick = e => {
    if (e.button !== 0) return;
    e.stopPropagation();
    CONTEXT_MENU_CTX.display[1](false);
    props.execute();
  };
  let shortcutText;
  if (props.hotkey) {
    shortcutText = "";
    if (props.alt) shortcutText += "Alt + ";
    if (props.ctrl) shortcutText += "Ctrl + ";
    if (props.shift) shortcutText += "Shift + ";
    shortcutText += String(props.hotkey);
  }
  return (() => {
    var _el$3 = _tmpl$4$6(),
      _el$4 = _el$3.firstChild,
      _el$5 = _el$4.firstChild,
      _el$6 = _el$5.nextSibling,
      _el$7 = _el$4.nextSibling,
      _el$8 = _el$7.firstChild,
      _el$9 = _el$8.firstChild;
    addEventListener(_el$3, "click", isDisabled ? void 0 : handleClick, true);
    _el$3.classList.toggle("disabled", !!isDisabled);
    insert(_el$6, createComponent(Icon, {
      get icon() {
        return props.icon ?? icons.blank;
      },
      hover: false
    }));
    insert(_el$8, createComponent(Show, {
      when: shortcutText,
      get children() {
        var _el$0 = _tmpl$3$6();
        createRenderEffect(() => _el$0.innerText = String(shortcutText));
        return _el$0;
      }
    }), null);
    createRenderEffect(() => _el$9.innerText = props.title);
    return _el$3;
  })();
}
delegateEvents(["click"]);

const intervalList = ["s", "m", "h", "D", "W", "M", "Y"];
const intervalValMap = {
  "s": 1,
  "m": 60,
  "h": 3600,
  "D": 86400,
  "W": 604800,
  "M": 2629743,
  "Y": 31556926,
  "E": -1
};
const intervalMap = {
  "s": "Second",
  "m": "Minute",
  "h": "Hour",
  "D": "Day",
  "W": "Week",
  "M": "Month",
  "Y": "Year",
  "E": "Error"
};
class tf {
  multiplier;
  period;
  constructor(mult, period) {
    this.multiplier = Math.floor(mult);
    this.period = period;
  }
  /**
   * Create a Timeframe Object from a string
   */
  static fromStr(str_in) {
    let interval_str = str_in.charAt(str_in.length - 1);
    if (!intervalList.includes(interval_str)) return new tf(-1, "E");
    let mult_str = str_in.split(interval_str)[0];
    let mult_num = mult_str === "" ? 1 : parseFloat(mult_str);
    return new tf(mult_num, interval_str);
  }
  /**
   * Create a Timeframe object from the given number. This is the inverse operation of .toValue(), 
   * i.e tf.from_value(new tf(1, 'D').toValue()) === new tf(1, 'D')
   * 
   * The value given is rounded down to the nearest integer multiple timeframe. e.g. (tf.from_value(new tf(1, 'D').toValue() - 1) === new tf(23, 'h'))
   * @param val The number of seconds within the given timeframe.
   */
  static fromValue(val) {
    for (let i = intervalList.length - 1; i >= 0; i--) {
      let mult = val / intervalValMap[intervalList[i]];
      if (mult >= 1) {
        return new tf(Math.round(mult), intervalList[i]);
      }
    }
    return new tf(-1, "E");
  }
  static isEqual(a, b) {
    return a.toValue() === b.toValue();
  }
  //Trim_unit can be set to True when displaying the timeframe. Should be set to false when transmitting the TF as a string.
  toString(trim_unit = false) {
    return `${trim_unit && this.multiplier === 1 ? "" : this.multiplier}${this.period}`;
  }
  toLabel() {
    return `${this.multiplier} ${intervalMap[this.period]}${this.multiplier > 1 ? "s" : ""}`;
  }
  toValue() {
    return this.multiplier * intervalValMap[this.period];
  }
}
class Delegate {
  _listeners = [];
  hasListeners() {
    return this._listeners.length > 0;
  }
  clear() {
    this._listeners = [];
  }
  subscribe(callback, linkedObject, singleshot) {
    const listener = {
      callback,
      linkedObject,
      singleshot: singleshot === true
    };
    this._listeners.push(listener);
  }
  unsubscribe(callback) {
    const index = this._listeners.findIndex(listener => callback === listener.callback);
    if (index > -1) this._listeners.splice(index, 1);
  }
  /* unsubscribe all but the callbacks associated with the given object */
  unsubscribeAll(linkedObject) {
    this._listeners = this._listeners.filter(listener => listener.linkedObject !== linkedObject);
  }
  fire(param1, param2, param3) {
    const listenersSnapshot = [...this._listeners];
    this._listeners = this._listeners.filter(listener => !listener.singleshot);
    listenersSnapshot.forEach(listener => listener.callback(param1, param2, param3));
  }
}
const ID_LEN = 4;
function makeId(IDs, prefix = "") {
  let result = prefix;
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < ID_LEN) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  if (IDs.includes(result)) return makeId(IDs, prefix);else {
    return result;
  }
}
function binarySearch(arr, el, compare_fn) {
  let m = 0;
  let n = arr.length - 1;
  while (m <= n) {
    let k = n + m >> 1;
    let cmp = compare_fn(el, arr[k]);
    if (cmp > 0) m = k + 1;else if (cmp < 0) n = k - 1;else return k;
  }
  return ~m;
}
function applyOpacity(style, opacity) {
  const colorValue = style.trim();
  if (!colorValue) return void 0;
  const rgbaMatch = colorValue.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const finalOpacity = a !== void 0 ? a : opacity;
    return `rgba(${r}, ${g}, ${b}, ${finalOpacity})`;
  }
  const hexMatch = colorValue.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex.split("").map(c => c + c).join("");
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = parseInt(hex.slice(6, 8), 16) / 255;
    if (isNaN(a)) return `rgba(${r}, ${g}, ${b}, ${opacity})`;else return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return void 0;
}
function padZeros(num) {
  return String(num).padStart(2, "0");
}
function UnixToString(timestamp) {
  let d = new Date(timestamp * 1e3);
  return [d.getUTCFullYear(), "-", padZeros(d.getUTCMonth() + 1), "-", padZeros(d.getUTCDate()), "T", padZeros(d.getUTCHours()), ":", padZeros(d.getUTCMinutes()), ":", padZeros(d.getSeconds()), "Z"].join("");
}

function deriveShortcuts(menuItems) {
  const items = Array.from(menuItems.flat()).filter(item => item.hotkey !== void 0);
  items.sort((a, b) => getPriority(a) - getPriority(b));
  return items;
}
function getPriority(item) {
  return (item.alt === void 0 ? 0 : 1) + (item.ctrl === void 0 ? 0 : 1) + (item.shift === void 0 ? 0 : 1) + (typeof item.hotkey === "string" ? 0 : -0.5);
}
const DEFAULT_CTX_ARGS = {
  attachHandler: (id, shortcuts) => {},
  detachHandler: id => {},
  attachAnonymousHandler: shortcuts => "",
  alt: () => false,
  ctrl: () => false,
  shift: () => false
};
let keyboardContext = createContext(DEFAULT_CTX_ARGS);
function KeyboardCTX() {
  return useContext(keyboardContext);
}
function KeyboardListener(props) {
  const [alt, setAlt] = createSignal(false);
  const [ctrl, setCtrl] = createSignal(false);
  const [shift, setShift] = createSignal(false);
  const HANDLERS = /* @__PURE__ */new Map();
  const boundKeyUp = onKeyUp.bind(HANDLERS, setAlt, setCtrl, setShift);
  const boundKeyDown = onKeyDown.bind(HANDLERS, setAlt, setCtrl, setShift);
  onMount(() => {
    window.addEventListener("keyup", boundKeyUp);
    window.addEventListener("keydown", boundKeyDown);
  });
  onCleanup(() => {
    window.removeEventListener("keyup", boundKeyUp);
    window.removeEventListener("keydown", boundKeyDown);
  });
  function anonymousHandler(shortcuts) {
    const new_id = makeId([...HANDLERS.keys()], "anon_");
    HANDLERS.set(new_id, shortcuts);
    return new_id;
  }
  const CTX_ARGS = {
    attachHandler: HANDLERS.set.bind(HANDLERS),
    detachHandler: HANDLERS.delete.bind(HANDLERS),
    attachAnonymousHandler: anonymousHandler,
    alt,
    ctrl,
    shift
  };
  keyboardContext = createContext(CTX_ARGS);
  return createComponent(keyboardContext.Provider, {
    value: CTX_ARGS,
    get children() {
      return props.children;
    }
  });
}
function maybeFireShortcut(e, shortcut) {
  if (shortcut.alt !== void 0 && shortcut.alt !== e.altKey) return false;
  if (shortcut.ctrl !== void 0 && shortcut.ctrl !== e.ctrlKey) return false;
  if (shortcut.shift !== void 0 && shortcut.shift !== e.shiftKey) return false;
  if (shortcut.disable?.()) return false;
  if (!e.key.match(shortcut.hotkey)) return false;
  shortcut.execute();
  return true;
}
function onKeyDown(setAlt, setCtrl, setShift, e) {
  if (e.repeat) return;
  switch (e.key) {
    case "Alt":
      setAlt(true);
      return;
    case "Shift":
      setShift(true);
      return;
    case "Control":
      setCtrl(true);
      return;
  }
  let handled = false;
  for (const [id, shortcuts] of Array.from(this).reverse()) {
    handled = shortcuts.some(s => maybeFireShortcut(e, s));
    if (handled) return;
  }
}
function onKeyUp(setAlt, setCtrl, setShift, e) {
  switch (e.key) {
    case "Alt":
      setAlt(false);
      return;
    case "Shift":
      setShift(false);
      return;
    case "Control":
      setCtrl(false);
      return;
  }
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var draggabilly = {exports: {}};

var getSize = {exports: {}};

/*!
 * Infinite Scroll v2.0.4
 * measure size of elements
 * MIT license
 */

var hasRequiredGetSize;

function requireGetSize () {
	if (hasRequiredGetSize) return getSize.exports;
	hasRequiredGetSize = 1;
	(function (module) {
		( function( window, factory ) {
		  if ( module.exports ) {
		    // CommonJS
		    module.exports = factory();
		  } else {
		    // browser global
		    window.getSize = factory();
		  }

		} )( window, function factory() {

		// -------------------------- helpers -------------------------- //

		// get a number from a string, not a percentage
		function getStyleSize( value ) {
		  let num = parseFloat( value );
		  // not a percent like '100%', and a number
		  let isValid = value.indexOf('%') == -1 && !isNaN( num );
		  return isValid && num;
		}

		// -------------------------- measurements -------------------------- //

		let measurements = [
		  'paddingLeft',
		  'paddingRight',
		  'paddingTop',
		  'paddingBottom',
		  'marginLeft',
		  'marginRight',
		  'marginTop',
		  'marginBottom',
		  'borderLeftWidth',
		  'borderRightWidth',
		  'borderTopWidth',
		  'borderBottomWidth',
		];

		function getZeroSize() {
		  let size = {
		    width: 0,
		    height: 0,
		    innerWidth: 0,
		    innerHeight: 0,
		    outerWidth: 0,
		    outerHeight: 0,
		  };
		  measurements.forEach( ( measurement ) => {
		    size[ measurement ] = 0;
		  } );
		  return size;
		}

		// -------------------------- getSize -------------------------- //

		function getSize( elem ) {
		  // use querySeletor if elem is string
		  if ( typeof elem == 'string' ) elem = document.querySelector( elem );

		  // do not proceed on non-objects
		  let isElement = elem && typeof elem == 'object' && elem.nodeType;
		  if ( !isElement ) return;

		  let style = getComputedStyle( elem );

		  // if hidden, everything is 0
		  if ( style.display == 'none' ) return getZeroSize();

		  let size = {};
		  size.width = elem.offsetWidth;
		  size.height = elem.offsetHeight;

		  let isBorderBox = size.isBorderBox = style.boxSizing == 'border-box';

		  // get all measurements
		  measurements.forEach( ( measurement ) => {
		    let value = style[ measurement ];
		    let num = parseFloat( value );
		    // any 'auto', 'medium' value will be 0
		    size[ measurement ] = !isNaN( num ) ? num : 0;
		  } );

		  let paddingWidth = size.paddingLeft + size.paddingRight;
		  let paddingHeight = size.paddingTop + size.paddingBottom;
		  let marginWidth = size.marginLeft + size.marginRight;
		  let marginHeight = size.marginTop + size.marginBottom;
		  let borderWidth = size.borderLeftWidth + size.borderRightWidth;
		  let borderHeight = size.borderTopWidth + size.borderBottomWidth;

		  // overwrite width and height if we can get it from style
		  let styleWidth = getStyleSize( style.width );
		  if ( styleWidth !== false ) {
		    size.width = styleWidth +
		      // add padding and border unless it's already including it
		      ( isBorderBox ? 0 : paddingWidth + borderWidth );
		  }

		  let styleHeight = getStyleSize( style.height );
		  if ( styleHeight !== false ) {
		    size.height = styleHeight +
		      // add padding and border unless it's already including it
		      ( isBorderBox ? 0 : paddingHeight + borderHeight );
		  }

		  size.innerWidth = size.width - ( paddingWidth + borderWidth );
		  size.innerHeight = size.height - ( paddingHeight + borderHeight );

		  size.outerWidth = size.width + marginWidth;
		  size.outerHeight = size.height + marginHeight;

		  return size;
		}

		return getSize;

		} ); 
	} (getSize));
	return getSize.exports;
}

var unidragger = {exports: {}};

var evEmitter = {exports: {}};

/**
 * EvEmitter v2.1.1
 * Lil' event emitter
 * MIT License
 */

var hasRequiredEvEmitter;

function requireEvEmitter () {
	if (hasRequiredEvEmitter) return evEmitter.exports;
	hasRequiredEvEmitter = 1;
	(function (module) {
		( function( global, factory ) {
		  // universal module definition
		  if ( module.exports ) {
		    // CommonJS - Browserify, Webpack
		    module.exports = factory();
		  } else {
		    // Browser globals
		    global.EvEmitter = factory();
		  }

		}( typeof window != 'undefined' ? window : commonjsGlobal, function() {

		function EvEmitter() {}

		let proto = EvEmitter.prototype;

		proto.on = function( eventName, listener ) {
		  if ( !eventName || !listener ) return this;

		  // set events hash
		  let events = this._events = this._events || {};
		  // set listeners array
		  let listeners = events[ eventName ] = events[ eventName ] || [];
		  // only add once
		  if ( !listeners.includes( listener ) ) {
		    listeners.push( listener );
		  }

		  return this;
		};

		proto.once = function( eventName, listener ) {
		  if ( !eventName || !listener ) return this;

		  // add event
		  this.on( eventName, listener );
		  // set once flag
		  // set onceEvents hash
		  let onceEvents = this._onceEvents = this._onceEvents || {};
		  // set onceListeners object
		  let onceListeners = onceEvents[ eventName ] = onceEvents[ eventName ] || {};
		  // set flag
		  onceListeners[ listener ] = true;

		  return this;
		};

		proto.off = function( eventName, listener ) {
		  let listeners = this._events && this._events[ eventName ];
		  if ( !listeners || !listeners.length ) return this;

		  let index = listeners.indexOf( listener );
		  if ( index != -1 ) {
		    listeners.splice( index, 1 );
		  }

		  return this;
		};

		proto.emitEvent = function( eventName, args ) {
		  let listeners = this._events && this._events[ eventName ];
		  if ( !listeners || !listeners.length ) return this;

		  // copy over to avoid interference if .off() in listener
		  listeners = listeners.slice( 0 );
		  args = args || [];
		  // once stuff
		  let onceListeners = this._onceEvents && this._onceEvents[ eventName ];

		  for ( let listener of listeners ) {
		    let isOnce = onceListeners && onceListeners[ listener ];
		    if ( isOnce ) {
		      // remove listener
		      // remove before trigger to prevent recursion
		      this.off( eventName, listener );
		      // unset once flag
		      delete onceListeners[ listener ];
		    }
		    // trigger listener
		    listener.apply( this, args );
		  }

		  return this;
		};

		proto.allOff = function() {
		  delete this._events;
		  delete this._onceEvents;
		  return this;
		};

		return EvEmitter;

		} ) ); 
	} (evEmitter));
	return evEmitter.exports;
}

/*!
 * Unidragger v3.0.1
 * Draggable base class
 * MIT license
 */

var hasRequiredUnidragger;

function requireUnidragger () {
	if (hasRequiredUnidragger) return unidragger.exports;
	hasRequiredUnidragger = 1;
	(function (module) {
		( function( window, factory ) {
		  // universal module definition
		  if ( module.exports ) {
		    // CommonJS
		    module.exports = factory(
		        window,
		        requireEvEmitter(),
		    );
		  } else {
		    // browser global
		    window.Unidragger = factory(
		        window,
		        window.EvEmitter,
		    );
		  }

		}( typeof window != 'undefined' ? window : commonjsGlobal, function factory( window, EvEmitter ) {

		function Unidragger() {}

		// inherit EvEmitter
		let proto = Unidragger.prototype = Object.create( EvEmitter.prototype );

		// ----- bind start ----- //

		// trigger handler methods for events
		proto.handleEvent = function( event ) {
		  let method = 'on' + event.type;
		  if ( this[ method ] ) {
		    this[ method ]( event );
		  }
		};

		let startEvent, activeEvents;
		if ( 'ontouchstart' in window ) {
		  // HACK prefer Touch Events as you can preventDefault on touchstart to
		  // disable scroll in iOS & mobile Chrome metafizzy/flickity#1177
		  startEvent = 'touchstart';
		  activeEvents = [ 'touchmove', 'touchend', 'touchcancel' ];
		} else if ( window.PointerEvent ) {
		  // Pointer Events
		  startEvent = 'pointerdown';
		  activeEvents = [ 'pointermove', 'pointerup', 'pointercancel' ];
		} else {
		  // mouse events
		  startEvent = 'mousedown';
		  activeEvents = [ 'mousemove', 'mouseup' ];
		}

		// prototype so it can be overwriteable by Flickity
		proto.touchActionValue = 'none';

		proto.bindHandles = function() {
		  this._bindHandles( 'addEventListener', this.touchActionValue );
		};

		proto.unbindHandles = function() {
		  this._bindHandles( 'removeEventListener', '' );
		};

		/**
		 * Add or remove start event
		 * @param {String} bindMethod - addEventListener or removeEventListener
		 * @param {String} touchAction - value for touch-action CSS property
		 */
		proto._bindHandles = function( bindMethod, touchAction ) {
		  this.handles.forEach( ( handle ) => {
		    handle[ bindMethod ]( startEvent, this );
		    handle[ bindMethod ]( 'click', this );
		    // touch-action: none to override browser touch gestures. metafizzy/flickity#540
		    if ( window.PointerEvent ) handle.style.touchAction = touchAction;
		  } );
		};

		proto.bindActivePointerEvents = function() {
		  activeEvents.forEach( ( eventName ) => {
		    window.addEventListener( eventName, this );
		  } );
		};

		proto.unbindActivePointerEvents = function() {
		  activeEvents.forEach( ( eventName ) => {
		    window.removeEventListener( eventName, this );
		  } );
		};

		// ----- event handler helpers ----- //

		// trigger method with matching pointer
		proto.withPointer = function( methodName, event ) {
		  if ( event.pointerId === this.pointerIdentifier ) {
		    this[ methodName ]( event, event );
		  }
		};

		// trigger method with matching touch
		proto.withTouch = function( methodName, event ) {
		  let touch;
		  for ( let changedTouch of event.changedTouches ) {
		    if ( changedTouch.identifier === this.pointerIdentifier ) {
		      touch = changedTouch;
		    }
		  }
		  if ( touch ) this[ methodName ]( event, touch );
		};

		// ----- start event ----- //

		proto.onmousedown = function( event ) {
		  this.pointerDown( event, event );
		};

		proto.ontouchstart = function( event ) {
		  this.pointerDown( event, event.changedTouches[0] );
		};

		proto.onpointerdown = function( event ) {
		  this.pointerDown( event, event );
		};

		// nodes that have text fields
		const cursorNodes = [ 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION' ];
		// input types that do not have text fields
		const clickTypes = [ 'radio', 'checkbox', 'button', 'submit', 'image', 'file' ];

		/**
		 * any time you set `event, pointer` it refers to:
		 * @param {Event} event
		 * @param {Event | Touch} pointer
		 */
		proto.pointerDown = function( event, pointer ) {
		  // dismiss multi-touch taps, right clicks, and clicks on text fields
		  let isCursorNode = cursorNodes.includes( event.target.nodeName );
		  let isClickType = clickTypes.includes( event.target.type );
		  let isOkayElement = !isCursorNode || isClickType;
		  let isOkay = !this.isPointerDown && !event.button && isOkayElement;
		  if ( !isOkay ) return;

		  this.isPointerDown = true;
		  // save pointer identifier to match up touch events
		  this.pointerIdentifier = pointer.pointerId !== undefined ?
		    // pointerId for pointer events, touch.indentifier for touch events
		    pointer.pointerId : pointer.identifier;
		  // track position for move
		  this.pointerDownPointer = {
		    pageX: pointer.pageX,
		    pageY: pointer.pageY,
		  };

		  this.bindActivePointerEvents();
		  this.emitEvent( 'pointerDown', [ event, pointer ] );
		};

		// ----- move ----- //

		proto.onmousemove = function( event ) {
		  this.pointerMove( event, event );
		};

		proto.onpointermove = function( event ) {
		  this.withPointer( 'pointerMove', event );
		};

		proto.ontouchmove = function( event ) {
		  this.withTouch( 'pointerMove', event );
		};

		proto.pointerMove = function( event, pointer ) {
		  let moveVector = {
		    x: pointer.pageX - this.pointerDownPointer.pageX,
		    y: pointer.pageY - this.pointerDownPointer.pageY,
		  };
		  this.emitEvent( 'pointerMove', [ event, pointer, moveVector ] );
		  // start drag if pointer has moved far enough to start drag
		  let isDragStarting = !this.isDragging && this.hasDragStarted( moveVector );
		  if ( isDragStarting ) this.dragStart( event, pointer );
		  if ( this.isDragging ) this.dragMove( event, pointer, moveVector );
		};

		// condition if pointer has moved far enough to start drag
		proto.hasDragStarted = function( moveVector ) {
		  return Math.abs( moveVector.x ) > 3 || Math.abs( moveVector.y ) > 3;
		};

		// ----- drag ----- //

		proto.dragStart = function( event, pointer ) {
		  this.isDragging = true;
		  this.isPreventingClicks = true; // set flag to prevent clicks
		  this.emitEvent( 'dragStart', [ event, pointer ] );
		};

		proto.dragMove = function( event, pointer, moveVector ) {
		  this.emitEvent( 'dragMove', [ event, pointer, moveVector ] );
		};

		// ----- end ----- //

		proto.onmouseup = function( event ) {
		  this.pointerUp( event, event );
		};

		proto.onpointerup = function( event ) {
		  this.withPointer( 'pointerUp', event );
		};

		proto.ontouchend = function( event ) {
		  this.withTouch( 'pointerUp', event );
		};

		proto.pointerUp = function( event, pointer ) {
		  this.pointerDone();
		  this.emitEvent( 'pointerUp', [ event, pointer ] );

		  if ( this.isDragging ) {
		    this.dragEnd( event, pointer );
		  } else {
		    // pointer didn't move enough for drag to start
		    this.staticClick( event, pointer );
		  }
		};

		proto.dragEnd = function( event, pointer ) {
		  this.isDragging = false; // reset flag
		  // re-enable clicking async
		  setTimeout( () => delete this.isPreventingClicks );

		  this.emitEvent( 'dragEnd', [ event, pointer ] );
		};

		// triggered on pointer up & pointer cancel
		proto.pointerDone = function() {
		  this.isPointerDown = false;
		  delete this.pointerIdentifier;
		  this.unbindActivePointerEvents();
		  this.emitEvent('pointerDone');
		};

		// ----- cancel ----- //

		proto.onpointercancel = function( event ) {
		  this.withPointer( 'pointerCancel', event );
		};

		proto.ontouchcancel = function( event ) {
		  this.withTouch( 'pointerCancel', event );
		};

		proto.pointerCancel = function( event, pointer ) {
		  this.pointerDone();
		  this.emitEvent( 'pointerCancel', [ event, pointer ] );
		};

		// ----- click ----- //

		// handle all clicks and prevent clicks when dragging
		proto.onclick = function( event ) {
		  if ( this.isPreventingClicks ) event.preventDefault();
		};

		// triggered after pointer down & up with no/tiny movement
		proto.staticClick = function( event, pointer ) {
		  // ignore emulated mouse up clicks
		  let isMouseup = event.type === 'mouseup';
		  if ( isMouseup && this.isIgnoringMouseUp ) return;

		  this.emitEvent( 'staticClick', [ event, pointer ] );

		  // set flag for emulated clicks 300ms after touchend
		  if ( isMouseup ) {
		    this.isIgnoringMouseUp = true;
		    // reset flag after 400ms
		    setTimeout( () => {
		      delete this.isIgnoringMouseUp;
		    }, 400 );
		  }
		};

		// -----  ----- //

		return Unidragger;

		} ) ); 
	} (unidragger));
	return unidragger.exports;
}

/*!
 * Draggabilly v3.0.0
 * Make that shiz draggable
 * https://draggabilly.desandro.com
 * MIT license
 */

(function (module) {
	( function( window, factory ) {
	  // universal module definition
	  if ( module.exports ) {
	    // CommonJS
	    module.exports = factory(
	        window,
	        requireGetSize(),
	        requireUnidragger(),
	    );
	  } else {
	    // browser global
	    window.Draggabilly = factory(
	        window,
	        window.getSize,
	        window.Unidragger,
	    );
	  }

	}( typeof window != 'undefined' ? window : commonjsGlobal,
	    function factory( window, getSize, Unidragger ) {

	// -------------------------- helpers & variables -------------------------- //

	function noop() {}

	let jQuery = window.jQuery;

	// -------------------------- Draggabilly -------------------------- //

	function Draggabilly( element, options ) {
	  // querySelector if string
	  this.element = typeof element == 'string' ?
	    document.querySelector( element ) : element;

	  if ( jQuery ) {
	    this.$element = jQuery( this.element );
	  }

	  // options
	  this.options = {};
	  this.option( options );

	  this._create();
	}

	// inherit Unidragger methods
	let proto = Draggabilly.prototype = Object.create( Unidragger.prototype );

	/**
	 * set options
	 * @param {Object} opts
	 */
	proto.option = function( opts ) {
	  this.options = {
	    ...this.options,
	    ...opts,
	  };
	};

	// css position values that don't need to be set
	const positionValues = [ 'relative', 'absolute', 'fixed' ];

	proto._create = function() {
	  // properties
	  this.position = {};
	  this._getPosition();

	  this.startPoint = { x: 0, y: 0 };
	  this.dragPoint = { x: 0, y: 0 };

	  this.startPosition = { ...this.position };

	  // set relative positioning
	  let style = getComputedStyle( this.element );
	  if ( !positionValues.includes( style.position ) ) {
	    this.element.style.position = 'relative';
	  }

	  // events
	  this.on( 'pointerDown', this.handlePointerDown );
	  this.on( 'pointerUp', this.handlePointerUp );
	  this.on( 'dragStart', this.handleDragStart );
	  this.on( 'dragMove', this.handleDragMove );
	  this.on( 'dragEnd', this.handleDragEnd );

	  this.setHandles();
	  this.enable();
	};

	// set this.handles  and bind start events to 'em
	proto.setHandles = function() {
	  let { handle } = this.options;
	  if ( typeof handle == 'string' ) {
	    this.handles = this.element.querySelectorAll( handle );
	  } else if ( typeof handle == 'object' && handle.length ) {
	    this.handles = handle;
	  } else if ( handle instanceof HTMLElement ) {
	    this.handles = [ handle ];
	  } else {
	    this.handles = [ this.element ];
	  }
	};

	const cancelableEvents = [ 'dragStart', 'dragMove', 'dragEnd' ];

	// duck-punch emitEvent to dispatch jQuery events as well
	let emitEvent = proto.emitEvent;
	proto.emitEvent = function( eventName, args ) {
	  // do not emit cancelable events if dragging is disabled
	  let isCanceled = !this.isEnabled && cancelableEvents.includes( eventName );
	  if ( isCanceled ) return;

	  emitEvent.call( this, eventName, args );

	  // trigger jQuery event
	  let jquery = window.jQuery;
	  if ( !jquery || !this.$element ) return;
	  // create jQuery event
	  let event;
	  let jqArgs = args;
	  let isFirstArgEvent = args && args[0] instanceof Event;
	  if ( isFirstArgEvent ) [ event, ...jqArgs ] = args;
	  /* eslint-disable-next-line new-cap */
	  let $event = jquery.Event( event );
	  $event.type = eventName;
	  this.$element.trigger( $event, jqArgs );
	};

	// -------------------------- position -------------------------- //

	// get x/y position from style
	proto._getPosition = function() {
	  let style = getComputedStyle( this.element );
	  let x = this._getPositionCoord( style.left, 'width' );
	  let y = this._getPositionCoord( style.top, 'height' );
	  // clean up 'auto' or other non-integer values
	  this.position.x = isNaN( x ) ? 0 : x;
	  this.position.y = isNaN( y ) ? 0 : y;

	  this._addTransformPosition( style );
	};

	proto._getPositionCoord = function( styleSide, measure ) {
	  if ( styleSide.includes('%') ) {
	    // convert percent into pixel for Safari, #75
	    let parentSize = getSize( this.element.parentNode );
	    // prevent not-in-DOM element throwing bug, #131
	    return !parentSize ? 0 :
	      ( parseFloat( styleSide ) / 100 ) * parentSize[ measure ];
	  }
	  return parseInt( styleSide, 10 );
	};

	// add transform: translate( x, y ) to position
	proto._addTransformPosition = function( style ) {
	  let transform = style.transform;
	  // bail out if value is 'none'
	  if ( !transform.startsWith('matrix') ) return;

	  // split matrix(1, 0, 0, 1, x, y)
	  let matrixValues = transform.split(',');
	  // translate X value is in 12th or 4th position
	  let xIndex = transform.startsWith('matrix3d') ? 12 : 4;
	  let translateX = parseInt( matrixValues[ xIndex ], 10 );
	  // translate Y value is in 13th or 5th position
	  let translateY = parseInt( matrixValues[ xIndex + 1 ], 10 );
	  this.position.x += translateX;
	  this.position.y += translateY;
	};

	// -------------------------- events -------------------------- //

	proto.handlePointerDown = function( event, pointer ) {
	  if ( !this.isEnabled ) return;
	  // track start event position
	  // Safari 9 overrides pageX and pageY. These values needs to be copied. flickity#842
	  this.pointerDownPointer = {
	    pageX: pointer.pageX,
	    pageY: pointer.pageY,
	  };

	  event.preventDefault();
	  document.activeElement.blur();
	  // bind move and end events
	  this.bindActivePointerEvents( event );
	  this.element.classList.add('is-pointer-down');
	};

	proto.handleDragStart = function() {
	  if ( !this.isEnabled ) return;

	  this._getPosition();
	  this.measureContainment();
	  // position _when_ drag began
	  this.startPosition.x = this.position.x;
	  this.startPosition.y = this.position.y;
	  // reset left/top style
	  this.setLeftTop();

	  this.dragPoint.x = 0;
	  this.dragPoint.y = 0;

	  this.element.classList.add('is-dragging');
	  // start animation
	  this.animate();
	};

	proto.measureContainment = function() {
	  let container = this.getContainer();
	  if ( !container ) return;

	  let elemSize = getSize( this.element );
	  let containerSize = getSize( container );
	  let {
	    borderLeftWidth,
	    borderRightWidth,
	    borderTopWidth,
	    borderBottomWidth,
	  } = containerSize;
	  let elemRect = this.element.getBoundingClientRect();
	  let containerRect = container.getBoundingClientRect();

	  let borderSizeX = borderLeftWidth + borderRightWidth;
	  let borderSizeY = borderTopWidth + borderBottomWidth;

	  let position = this.relativeStartPosition = {
	    x: elemRect.left - ( containerRect.left + borderLeftWidth ),
	    y: elemRect.top - ( containerRect.top + borderTopWidth ),
	  };

	  this.containSize = {
	    width: ( containerSize.width - borderSizeX ) - position.x - elemSize.width,
	    height: ( containerSize.height - borderSizeY ) - position.y - elemSize.height,
	  };
	};

	proto.getContainer = function() {
	  let containment = this.options.containment;
	  if ( !containment ) return;

	  let isElement = containment instanceof HTMLElement;
	  // use as element
	  if ( isElement ) return containment;

	  // querySelector if string
	  if ( typeof containment == 'string' ) {
	    return document.querySelector( containment );
	  }
	  // fallback to parent element
	  return this.element.parentNode;
	};

	// ----- move event ----- //

	/**
	 * drag move
	 * @param {Event} event
	 * @param {Event | Touch} pointer
	 * @param {Object} moveVector - x and y coordinates
	 */
	proto.handleDragMove = function( event, pointer, moveVector ) {
	  if ( !this.isEnabled ) return;

	  let dragX = moveVector.x;
	  let dragY = moveVector.y;

	  let grid = this.options.grid;
	  let gridX = grid && grid[0];
	  let gridY = grid && grid[1];

	  dragX = applyGrid( dragX, gridX );
	  dragY = applyGrid( dragY, gridY );

	  dragX = this.containDrag( 'x', dragX, gridX );
	  dragY = this.containDrag( 'y', dragY, gridY );

	  // constrain to axis
	  dragX = this.options.axis == 'y' ? 0 : dragX;
	  dragY = this.options.axis == 'x' ? 0 : dragY;

	  this.position.x = this.startPosition.x + dragX;
	  this.position.y = this.startPosition.y + dragY;
	  // set dragPoint properties
	  this.dragPoint.x = dragX;
	  this.dragPoint.y = dragY;
	};

	function applyGrid( value, grid, method ) {
	  if ( !grid ) return value;

	  method = method || 'round';
	  return Math[ method ]( value/grid ) * grid;
	}

	proto.containDrag = function( axis, drag, grid ) {
	  if ( !this.options.containment ) return drag;

	  let measure = axis == 'x' ? 'width' : 'height';

	  let rel = this.relativeStartPosition[ axis ];
	  let min = applyGrid( -rel, grid, 'ceil' );
	  let max = this.containSize[ measure ];
	  max = applyGrid( max, grid, 'floor' );
	  return Math.max( min, Math.min( max, drag ) );
	};

	// ----- end event ----- //

	proto.handlePointerUp = function() {
	  this.element.classList.remove('is-pointer-down');
	};

	proto.handleDragEnd = function() {
	  if ( !this.isEnabled ) return;

	  // use top left position when complete
	  this.element.style.transform = '';
	  this.setLeftTop();
	  this.element.classList.remove('is-dragging');
	};

	// -------------------------- animation -------------------------- //

	proto.animate = function() {
	  // only render and animate if dragging
	  if ( !this.isDragging ) return;

	  this.positionDrag();
	  requestAnimationFrame( () => this.animate() );
	};

	// left/top positioning
	proto.setLeftTop = function() {
	  let { x, y } = this.position;
	  this.element.style.left = `${x}px`;
	  this.element.style.top = `${y}px`;
	};

	proto.positionDrag = function() {
	  let { x, y } = this.dragPoint;
	  this.element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
	};

	// ----- methods ----- //

	/**
	 * @param {Number} x
	 * @param {Number} y
	 */
	proto.setPosition = function( x, y ) {
	  this.position.x = x;
	  this.position.y = y;
	  this.setLeftTop();
	};

	proto.enable = function() {
	  if ( this.isEnabled ) return;
	  this.isEnabled = true;
	  this.bindHandles();
	};

	proto.disable = function() {
	  if ( !this.isEnabled ) return;
	  this.isEnabled = false;
	  if ( this.isDragging ) this.dragEnd();
	  this.unbindHandles();
	};

	const resetCssProperties = [ 'transform', 'left', 'top', 'position' ];

	proto.destroy = function() {
	  this.disable();
	  // reset styles
	  resetCssProperties.forEach( ( prop ) => {
	    this.element.style[ prop ] = '';
	  } );
	  // unbind handles
	  this.unbindHandles();
	  // remove jQuery data
	  if ( this.$element ) this.$element.removeData('draggabilly');
	};

	// ----- jQuery bridget ----- //

	// required for jQuery bridget
	proto._init = noop;

	if ( jQuery && jQuery.bridget ) {
	  jQuery.bridget( 'draggabilly', Draggabilly );
	}

	// -----  ----- //

	return Draggabilly;

	} ) ); 
} (draggabilly));

var draggabillyExports = draggabilly.exports;
const vitePluginRequire_1756058754781_69492986 = /*@__PURE__*/getDefaultExportFromCjs(draggabillyExports);

function size(_a) {
    var width = _a.width, height = _a.height;
    if (width < 0) {
        throw new Error('Negative width is not allowed for Size');
    }
    if (height < 0) {
        throw new Error('Negative height is not allowed for Size');
    }
    return {
        width: width,
        height: height,
    };
}
function equalSizes(first, second) {
    return (first.width === second.width) &&
        (first.height === second.height);
}

var Observable = /** @class */ (function () {
    function Observable(win) {
        var _this = this;
        this._resolutionListener = function () { return _this._onResolutionChanged(); };
        this._resolutionMediaQueryList = null;
        this._observers = [];
        this._window = win;
        this._installResolutionListener();
    }
    Observable.prototype.dispose = function () {
        this._uninstallResolutionListener();
        this._window = null;
    };
    Object.defineProperty(Observable.prototype, "value", {
        get: function () {
            return this._window.devicePixelRatio;
        },
        enumerable: false,
        configurable: true
    });
    Observable.prototype.subscribe = function (next) {
        var _this = this;
        var observer = { next: next };
        this._observers.push(observer);
        return {
            unsubscribe: function () {
                _this._observers = _this._observers.filter(function (o) { return o !== observer; });
            },
        };
    };
    Observable.prototype._installResolutionListener = function () {
        if (this._resolutionMediaQueryList !== null) {
            throw new Error('Resolution listener is already installed');
        }
        var dppx = this._window.devicePixelRatio;
        this._resolutionMediaQueryList = this._window.matchMedia("all and (resolution: ".concat(dppx, "dppx)"));
        // IE and some versions of Edge do not support addEventListener/removeEventListener, and we are going to use the deprecated addListener/removeListener
        this._resolutionMediaQueryList.addListener(this._resolutionListener);
    };
    Observable.prototype._uninstallResolutionListener = function () {
        if (this._resolutionMediaQueryList !== null) {
            // IE and some versions of Edge do not support addEventListener/removeEventListener, and we are going to use the deprecated addListener/removeListener
            this._resolutionMediaQueryList.removeListener(this._resolutionListener);
            this._resolutionMediaQueryList = null;
        }
    };
    Observable.prototype._reinstallResolutionListener = function () {
        this._uninstallResolutionListener();
        this._installResolutionListener();
    };
    Observable.prototype._onResolutionChanged = function () {
        var _this = this;
        this._observers.forEach(function (observer) { return observer.next(_this._window.devicePixelRatio); });
        this._reinstallResolutionListener();
    };
    return Observable;
}());
function createObservable(win) {
    return new Observable(win);
}

var DevicePixelContentBoxBinding = /** @class */ (function () {
    function DevicePixelContentBoxBinding(canvasElement, transformBitmapSize, options) {
        var _a;
        this._canvasElement = null;
        this._bitmapSizeChangedListeners = [];
        this._suggestedBitmapSize = null;
        this._suggestedBitmapSizeChangedListeners = [];
        // devicePixelRatio approach
        this._devicePixelRatioObservable = null;
        // ResizeObserver approach
        this._canvasElementResizeObserver = null;
        this._canvasElement = canvasElement;
        this._canvasElementClientSize = size({
            width: this._canvasElement.clientWidth,
            height: this._canvasElement.clientHeight,
        });
        this._transformBitmapSize = transformBitmapSize !== null && transformBitmapSize !== void 0 ? transformBitmapSize : (function (size) { return size; });
        this._allowResizeObserver = (_a = options === null || options === void 0 ? void 0 : options.allowResizeObserver) !== null && _a !== void 0 ? _a : true;
        this._chooseAndInitObserver();
        // we MAY leave the constuctor without any bitmap size observation mechanics initialized
    }
    DevicePixelContentBoxBinding.prototype.dispose = function () {
        var _a, _b;
        if (this._canvasElement === null) {
            throw new Error('Object is disposed');
        }
        (_a = this._canvasElementResizeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        this._canvasElementResizeObserver = null;
        (_b = this._devicePixelRatioObservable) === null || _b === void 0 ? void 0 : _b.dispose();
        this._devicePixelRatioObservable = null;
        this._suggestedBitmapSizeChangedListeners.length = 0;
        this._bitmapSizeChangedListeners.length = 0;
        this._canvasElement = null;
    };
    Object.defineProperty(DevicePixelContentBoxBinding.prototype, "canvasElement", {
        get: function () {
            if (this._canvasElement === null) {
                throw new Error('Object is disposed');
            }
            return this._canvasElement;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(DevicePixelContentBoxBinding.prototype, "canvasElementClientSize", {
        get: function () {
            return this._canvasElementClientSize;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(DevicePixelContentBoxBinding.prototype, "bitmapSize", {
        get: function () {
            return size({
                width: this.canvasElement.width,
                height: this.canvasElement.height,
            });
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Use this function to change canvas element client size until binding is disposed
     * @param clientSize New client size for bound HTMLCanvasElement
     */
    DevicePixelContentBoxBinding.prototype.resizeCanvasElement = function (clientSize) {
        this._canvasElementClientSize = size(clientSize);
        this.canvasElement.style.width = "".concat(this._canvasElementClientSize.width, "px");
        this.canvasElement.style.height = "".concat(this._canvasElementClientSize.height, "px");
        this._invalidateBitmapSize();
    };
    DevicePixelContentBoxBinding.prototype.subscribeBitmapSizeChanged = function (listener) {
        this._bitmapSizeChangedListeners.push(listener);
    };
    DevicePixelContentBoxBinding.prototype.unsubscribeBitmapSizeChanged = function (listener) {
        this._bitmapSizeChangedListeners = this._bitmapSizeChangedListeners.filter(function (l) { return l !== listener; });
    };
    Object.defineProperty(DevicePixelContentBoxBinding.prototype, "suggestedBitmapSize", {
        get: function () {
            return this._suggestedBitmapSize;
        },
        enumerable: false,
        configurable: true
    });
    DevicePixelContentBoxBinding.prototype.subscribeSuggestedBitmapSizeChanged = function (listener) {
        this._suggestedBitmapSizeChangedListeners.push(listener);
    };
    DevicePixelContentBoxBinding.prototype.unsubscribeSuggestedBitmapSizeChanged = function (listener) {
        this._suggestedBitmapSizeChangedListeners = this._suggestedBitmapSizeChangedListeners.filter(function (l) { return l !== listener; });
    };
    DevicePixelContentBoxBinding.prototype.applySuggestedBitmapSize = function () {
        if (this._suggestedBitmapSize === null) {
            // nothing to apply
            return;
        }
        var oldSuggestedSize = this._suggestedBitmapSize;
        this._suggestedBitmapSize = null;
        this._resizeBitmap(oldSuggestedSize);
        this._emitSuggestedBitmapSizeChanged(oldSuggestedSize, this._suggestedBitmapSize);
    };
    DevicePixelContentBoxBinding.prototype._resizeBitmap = function (newSize) {
        var oldSize = this.bitmapSize;
        if (equalSizes(oldSize, newSize)) {
            return;
        }
        this.canvasElement.width = newSize.width;
        this.canvasElement.height = newSize.height;
        this._emitBitmapSizeChanged(oldSize, newSize);
    };
    DevicePixelContentBoxBinding.prototype._emitBitmapSizeChanged = function (oldSize, newSize) {
        var _this = this;
        this._bitmapSizeChangedListeners.forEach(function (listener) { return listener.call(_this, oldSize, newSize); });
    };
    DevicePixelContentBoxBinding.prototype._suggestNewBitmapSize = function (newSize) {
        var oldSuggestedSize = this._suggestedBitmapSize;
        var finalNewSize = size(this._transformBitmapSize(newSize, this._canvasElementClientSize));
        var newSuggestedSize = equalSizes(this.bitmapSize, finalNewSize) ? null : finalNewSize;
        if (oldSuggestedSize === null && newSuggestedSize === null) {
            return;
        }
        if (oldSuggestedSize !== null && newSuggestedSize !== null
            && equalSizes(oldSuggestedSize, newSuggestedSize)) {
            return;
        }
        this._suggestedBitmapSize = newSuggestedSize;
        this._emitSuggestedBitmapSizeChanged(oldSuggestedSize, newSuggestedSize);
    };
    DevicePixelContentBoxBinding.prototype._emitSuggestedBitmapSizeChanged = function (oldSize, newSize) {
        var _this = this;
        this._suggestedBitmapSizeChangedListeners.forEach(function (listener) { return listener.call(_this, oldSize, newSize); });
    };
    DevicePixelContentBoxBinding.prototype._chooseAndInitObserver = function () {
        var _this = this;
        if (!this._allowResizeObserver) {
            this._initDevicePixelRatioObservable();
            return;
        }
        isDevicePixelContentBoxSupported()
            .then(function (isSupported) {
            return isSupported ?
                _this._initResizeObserver() :
                _this._initDevicePixelRatioObservable();
        });
    };
    // devicePixelRatio approach
    DevicePixelContentBoxBinding.prototype._initDevicePixelRatioObservable = function () {
        var _this = this;
        if (this._canvasElement === null) {
            // it looks like we are already dead
            return;
        }
        var win = canvasElementWindow(this._canvasElement);
        if (win === null) {
            throw new Error('No window is associated with the canvas');
        }
        this._devicePixelRatioObservable = createObservable(win);
        this._devicePixelRatioObservable.subscribe(function () { return _this._invalidateBitmapSize(); });
        this._invalidateBitmapSize();
    };
    DevicePixelContentBoxBinding.prototype._invalidateBitmapSize = function () {
        var _a, _b;
        if (this._canvasElement === null) {
            // it looks like we are already dead
            return;
        }
        var win = canvasElementWindow(this._canvasElement);
        if (win === null) {
            return;
        }
        var ratio = (_b = (_a = this._devicePixelRatioObservable) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : win.devicePixelRatio;
        var canvasRects = this._canvasElement.getClientRects();
        var newSize = 
        // eslint-disable-next-line no-negated-condition
        canvasRects[0] !== undefined ?
            predictedBitmapSize(canvasRects[0], ratio) :
            size({
                width: this._canvasElementClientSize.width * ratio,
                height: this._canvasElementClientSize.height * ratio,
            });
        this._suggestNewBitmapSize(newSize);
    };
    // ResizeObserver approach
    DevicePixelContentBoxBinding.prototype._initResizeObserver = function () {
        var _this = this;
        if (this._canvasElement === null) {
            // it looks like we are already dead
            return;
        }
        this._canvasElementResizeObserver = new ResizeObserver(function (entries) {
            var entry = entries.find(function (entry) { return entry.target === _this._canvasElement; });
            if (!entry || !entry.devicePixelContentBoxSize || !entry.devicePixelContentBoxSize[0]) {
                return;
            }
            var entrySize = entry.devicePixelContentBoxSize[0];
            var newSize = size({
                width: entrySize.inlineSize,
                height: entrySize.blockSize,
            });
            _this._suggestNewBitmapSize(newSize);
        });
        this._canvasElementResizeObserver.observe(this._canvasElement, { box: 'device-pixel-content-box' });
    };
    return DevicePixelContentBoxBinding;
}());
function bindTo(canvasElement, target) {
    {
        return new DevicePixelContentBoxBinding(canvasElement, target.transform, target.options);
    }
}
function canvasElementWindow(canvasElement) {
    // According to DOM Level 2 Core specification, ownerDocument should never be null for HTMLCanvasElement
    // see https://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/core.html#node-ownerDoc
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return canvasElement.ownerDocument.defaultView;
}
function isDevicePixelContentBoxSupported() {
    return new Promise(function (resolve) {
        var ro = new ResizeObserver(function (entries) {
            resolve(entries.every(function (entry) { return 'devicePixelContentBoxSize' in entry; }));
            ro.disconnect();
        });
        ro.observe(document.body, { box: 'device-pixel-content-box' });
    })
        .catch(function () { return false; });
}
function predictedBitmapSize(canvasRect, ratio) {
    return size({
        width: Math.round(canvasRect.left * ratio + canvasRect.width * ratio) -
            Math.round(canvasRect.left * ratio),
        height: Math.round(canvasRect.top * ratio + canvasRect.height * ratio) -
            Math.round(canvasRect.top * ratio),
    });
}

/**
 * @experimental
 */
var CanvasRenderingTarget2D = /** @class */ (function () {
    function CanvasRenderingTarget2D(context, mediaSize, bitmapSize) {
        if (mediaSize.width === 0 || mediaSize.height === 0) {
            throw new TypeError('Rendering target could only be created on a media with positive width and height');
        }
        this._mediaSize = mediaSize;
        // !Number.isInteger(bitmapSize.width) || !Number.isInteger(bitmapSize.height)
        if (bitmapSize.width === 0 || bitmapSize.height === 0) {
            throw new TypeError('Rendering target could only be created using a bitmap with positive integer width and height');
        }
        this._bitmapSize = bitmapSize;
        this._context = context;
    }
    CanvasRenderingTarget2D.prototype.useMediaCoordinateSpace = function (f) {
        try {
            this._context.save();
            // do not use resetTransform to support old versions of Edge
            this._context.setTransform(1, 0, 0, 1, 0, 0);
            this._context.scale(this._horizontalPixelRatio, this._verticalPixelRatio);
            return f({
                context: this._context,
                mediaSize: this._mediaSize,
            });
        }
        finally {
            this._context.restore();
        }
    };
    CanvasRenderingTarget2D.prototype.useBitmapCoordinateSpace = function (f) {
        try {
            this._context.save();
            // do not use resetTransform to support old versions of Edge
            this._context.setTransform(1, 0, 0, 1, 0, 0);
            return f({
                context: this._context,
                mediaSize: this._mediaSize,
                bitmapSize: this._bitmapSize,
                horizontalPixelRatio: this._horizontalPixelRatio,
                verticalPixelRatio: this._verticalPixelRatio,
            });
        }
        finally {
            this._context.restore();
        }
    };
    Object.defineProperty(CanvasRenderingTarget2D.prototype, "_horizontalPixelRatio", {
        get: function () {
            return this._bitmapSize.width / this._mediaSize.width;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(CanvasRenderingTarget2D.prototype, "_verticalPixelRatio", {
        get: function () {
            return this._bitmapSize.height / this._mediaSize.height;
        },
        enumerable: false,
        configurable: true
    });
    return CanvasRenderingTarget2D;
}());
/**
 * @experimental
 */
function tryCreateCanvasRenderingTarget2D(binding, contextOptions) {
    var mediaSize = binding.canvasElementClientSize;
    if (mediaSize.width === 0 || mediaSize.height === 0) {
        return null;
    }
    var bitmapSize = binding.bitmapSize;
    if (bitmapSize.width === 0 || bitmapSize.height === 0) {
        return null;
    }
    var context = binding.canvasElement.getContext('2d', contextOptions);
    if (context === null) {
        return null;
    }
    return new CanvasRenderingTarget2D(context, mediaSize, bitmapSize);
}

/*!
 * @license
 * TradingView Lightweight Charts™ v5.0.8
 * Copyright (c) 2025 TradingView, Inc.
 * Licensed under Apache License 2.0 https://www.apache.org/licenses/LICENSE-2.0
 */
const e={title:"",visible:true,lastValueVisible:true,priceLineVisible:true,priceLineSource:0,priceLineWidth:1,priceLineColor:"",priceLineStyle:2,baseLineVisible:true,baseLineWidth:1,baseLineColor:"#B2B5BE",baseLineStyle:0,priceFormat:{type:"price",precision:2,minMove:.01}};var r,h;function a(t,i){const s={0:[],1:[t.lineWidth,t.lineWidth],2:[2*t.lineWidth,2*t.lineWidth],3:[6*t.lineWidth,6*t.lineWidth],4:[t.lineWidth,4*t.lineWidth]}[i];t.setLineDash(s);}function l(t,i,s,n){t.beginPath();const e=t.lineWidth%2?.5:0;t.moveTo(s,i+e),t.lineTo(n,i+e),t.stroke();}function o(t,i){if(!t)throw new Error("Assertion failed"+(i?": "+i:""))}function _(t){if(void 0===t)throw new Error("Value is undefined");return t}function u(t){if(null===t)throw new Error("Value is null");return t}function c(t){return u(_(t))}!function(t){t[t.Simple=0]="Simple",t[t.WithSteps=1]="WithSteps",t[t.Curved=2]="Curved";}(r||(r={})),function(t){t[t.Solid=0]="Solid",t[t.Dotted=1]="Dotted",t[t.Dashed=2]="Dashed",t[t.LargeDashed=3]="LargeDashed",t[t.SparseDotted=4]="SparseDotted";}(h||(h={}));class d{constructor(){this.t=[];}i(t,i,s){const n={h:t,l:i,o:true===s};this.t.push(n);}_(t){const i=this.t.findIndex((i=>t===i.h));i>-1&&this.t.splice(i,1);}u(t){this.t=this.t.filter((i=>i.l!==t));}p(t,i,s){const n=[...this.t];this.t=this.t.filter((t=>!t.o)),n.forEach((n=>n.h(t,i,s)));}v(){return this.t.length>0}m(){this.t=[];}}function f(t,...i){for(const s of i)for(const i in s) void 0!==s[i]&&Object.prototype.hasOwnProperty.call(s,i)&&!["__proto__","constructor","prototype"].includes(i)&&("object"!=typeof s[i]||void 0===t[i]||Array.isArray(s[i])?t[i]=s[i]:f(t[i],s[i]));return t}function p(t){return "number"==typeof t&&isFinite(t)}function v(t){return "number"==typeof t&&t%1==0}function m(t){return "string"==typeof t}function w(t){return "boolean"==typeof t}function g(t){const i=t;if(!i||"object"!=typeof i)return i;let s,n,e;for(n in s=Array.isArray(i)?[]:{},i)i.hasOwnProperty(n)&&(e=i[n],s[n]=e&&"object"==typeof e?g(e):e);return s}function M(t){return null!==t}function b(t){return null===t?void 0:t}const S="-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";function x(t,i,s){return void 0===i&&(i=S),`${s=void 0!==s?`${s} `:""}${t}px ${i}`}class C{constructor(t){this.M={S:1,C:5,P:NaN,k:"",T:"",R:"",D:"",V:0,I:0,B:0,A:0,L:0},this.O=t;}N(){const t=this.M,i=this.F(),s=this.W();return t.P===i&&t.T===s||(t.P=i,t.T=s,t.k=x(i,s),t.A=2.5/12*i,t.V=t.A,t.I=i/12*t.C,t.B=i/12*t.C,t.L=0),t.R=this.H(),t.D=this.U(),this.M}H(){return this.O.N().layout.textColor}U(){return this.O.$()}F(){return this.O.N().layout.fontSize}W(){return this.O.N().layout.fontFamily}}function P(t){return t<0?0:t>255?255:Math.round(t)||0}function k(t){return .199*t[0]+.687*t[1]+.114*t[2]}class y{constructor(t,i){this.q=new Map,this.Y=t,i&&(this.q=i);}j(t,i){if("transparent"===t)return t;const s=this.K(t),n=s[3];return `rgba(${s[0]}, ${s[1]}, ${s[2]}, ${i*n})`}X(t){const i=this.K(t);return {Z:`rgb(${i[0]}, ${i[1]}, ${i[2]})`,G:k(i)>160?"black":"white"}}J(t){return k(this.K(t))}tt(t,i,s){const[n,e,r,h]=this.K(t),[a,l,o,_]=this.K(i),u=[P(n+s*(a-n)),P(e+s*(l-e)),P(r+s*(o-r)),(c=h+s*(_-h),c<=0||c>1?Math.min(Math.max(c,0),1):Math.round(1e4*c)/1e4)];var c;return `rgba(${u[0]}, ${u[1]}, ${u[2]}, ${u[3]})`}K(t){const i=this.q.get(t);if(i)return i;const s=function(t){const i=document.createElement("div");i.style.display="none",document.body.appendChild(i),i.style.color=t;const s=window.getComputedStyle(i).color;return document.body.removeChild(i),s}(t),n=s.match(/^rgba?\s*\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)$/);if(!n){if(this.Y.length)for(const i of this.Y){const s=i(t);if(s)return this.q.set(t,s),s}throw new Error(`Failed to parse color: ${t}`)}const e=[parseInt(n[1],10),parseInt(n[2],10),parseInt(n[3],10),n[4]?parseFloat(n[4]):1];return this.q.set(t,e),e}}class T{constructor(){this.it=[];}st(t){this.it=t;}nt(t,i,s){this.it.forEach((n=>{n.nt(t,i,s);}));}}class R{nt(t,i,s){t.useBitmapCoordinateSpace((t=>this.et(t,i,s)));}}class D extends R{constructor(){super(...arguments),this.rt=null;}ht(t){this.rt=t;}et({context:t,horizontalPixelRatio:i,verticalPixelRatio:s}){if(null===this.rt||null===this.rt.lt)return;const n=this.rt.lt,e=this.rt,r=Math.max(1,Math.floor(i))%2/2,h=h=>{t.beginPath();for(let a=n.to-1;a>=n.from;--a){const n=e.ot[a],l=Math.round(n._t*i)+r,o=n.ut*s,_=h*s+r;t.moveTo(l,o),t.arc(l,o,_,0,2*Math.PI);}t.fill();};e.ct>0&&(t.fillStyle=e.dt,h(e.ft+e.ct)),t.fillStyle=e.vt,h(e.ft);}}function V(){return {ot:[{_t:0,ut:0,wt:0,gt:0}],vt:"",dt:"",ft:0,ct:0,lt:null}}const I={from:0,to:1};class B{constructor(t,i,s){this.Mt=new T,this.bt=[],this.St=[],this.xt=true,this.O=t,this.Ct=i,this.Pt=s,this.Mt.st(this.bt);}kt(t){this.yt(),this.xt=true;}Tt(){return this.xt&&(this.Rt(),this.xt=false),this.Mt}yt(){const t=this.Pt.Dt();t.length!==this.bt.length&&(this.St=t.map(V),this.bt=this.St.map((t=>{const i=new D;return i.ht(t),i})),this.Mt.st(this.bt));}Rt(){const t=2===this.Ct.N().mode||!this.Ct.Vt(),i=this.Pt.It(),s=this.Ct.Bt(),n=this.O.Et();this.yt(),i.forEach(((i,e)=>{const r=this.St[e],h=i.At(s),a=i.zt();!t&&null!==h&&i.Vt()&&null!==a?(r.vt=h.Lt,r.ft=h.ft,r.ct=h.Ot,r.ot[0].gt=h.gt,r.ot[0].ut=i.Ft().Nt(h.gt,a.Wt),r.dt=h.Ht??this.O.Ut(r.ot[0].ut/i.Ft().$t()),r.ot[0].wt=s,r.ot[0]._t=n.qt(s),r.lt=I):r.lt=null;}));}}class E extends R{constructor(t){super(),this.Yt=t;}et({context:t,bitmapSize:i,horizontalPixelRatio:s,verticalPixelRatio:n}){if(null===this.Yt)return;const e=this.Yt.jt.Vt,r=this.Yt.Kt.Vt;if(!e&&!r)return;const h=Math.round(this.Yt._t*s),o=Math.round(this.Yt.ut*n);t.lineCap="butt",e&&h>=0&&(t.lineWidth=Math.floor(this.Yt.jt.ct*s),t.strokeStyle=this.Yt.jt.R,t.fillStyle=this.Yt.jt.R,a(t,this.Yt.jt.Xt),function(t,i,s,n){t.beginPath();const e=t.lineWidth%2?.5:0;t.moveTo(i+e,s),t.lineTo(i+e,n),t.stroke();}(t,h,0,i.height)),r&&o>=0&&(t.lineWidth=Math.floor(this.Yt.Kt.ct*n),t.strokeStyle=this.Yt.Kt.R,t.fillStyle=this.Yt.Kt.R,a(t,this.Yt.Kt.Xt),l(t,o,0,i.width));}}class A{constructor(t,i){this.xt=true,this.Zt={jt:{ct:1,Xt:0,R:"",Vt:false},Kt:{ct:1,Xt:0,R:"",Vt:false},_t:0,ut:0},this.Gt=new E(this.Zt),this.Jt=t,this.Pt=i;}kt(){this.xt=true;}Tt(t){return this.xt&&(this.Rt(),this.xt=false),this.Gt}Rt(){const t=this.Jt.Vt(),i=this.Pt.Qt().N().crosshair,s=this.Zt;if(2===i.mode)return s.Kt.Vt=false,void(s.jt.Vt=false);s.Kt.Vt=t&&this.Jt.ti(this.Pt),s.jt.Vt=t&&this.Jt.ii(),s.Kt.ct=i.horzLine.width,s.Kt.Xt=i.horzLine.style,s.Kt.R=i.horzLine.color,s.jt.ct=i.vertLine.width,s.jt.Xt=i.vertLine.style,s.jt.R=i.vertLine.color,s._t=this.Jt.si(),s.ut=this.Jt.ni();}}function z(t,i,s,n,e,r){t.fillRect(i+r,s,n-2*r,r),t.fillRect(i+r,s+e-r,n-2*r,r),t.fillRect(i,s,r,e),t.fillRect(i+n-r,s,r,e);}function L(t,i,s,n,e,r){t.save(),t.globalCompositeOperation="copy",t.fillStyle=r,t.fillRect(i,s,n,e),t.restore();}function O(t,i,s,n,e,r){t.beginPath(),t.roundRect?t.roundRect(i,s,n,e,r):(t.lineTo(i+n-r[1],s),0!==r[1]&&t.arcTo(i+n,s,i+n,s+r[1],r[1]),t.lineTo(i+n,s+e-r[2]),0!==r[2]&&t.arcTo(i+n,s+e,i+n-r[2],s+e,r[2]),t.lineTo(i+r[3],s+e),0!==r[3]&&t.arcTo(i,s+e,i,s+e-r[3],r[3]),t.lineTo(i,s+r[0]),0!==r[0]&&t.arcTo(i,s,i+r[0],s,r[0]));}function N(t,i,s,n,e,r,h=0,a=[0,0,0,0],l=""){if(t.save(),!h||!l||l===r)return O(t,i,s,n,e,a),t.fillStyle=r,t.fill(),void t.restore();const o=h/2;var _;O(t,i+o,s+o,n-h,e-h,(_=-o,a.map((t=>0===t?t:t+_)))),"transparent"!==r&&(t.fillStyle=r,t.fill()),"transparent"!==l&&(t.lineWidth=h,t.strokeStyle=l,t.closePath(),t.stroke()),t.restore();}function F(t,i,s,n,e,r,h){t.save(),t.globalCompositeOperation="copy";const a=t.createLinearGradient(0,0,0,e);a.addColorStop(0,r),a.addColorStop(1,h),t.fillStyle=a,t.fillRect(i,s,n,e),t.restore();}class W{constructor(t,i){this.ht(t,i);}ht(t,i){this.Yt=t,this.ei=i;}$t(t,i){return this.Yt.Vt?t.P+t.A+t.V:0}nt(t,i,s,n){if(!this.Yt.Vt||0===this.Yt.ri.length)return;const e=this.Yt.R,r=this.ei.Z,h=t.useBitmapCoordinateSpace((t=>{const h=t.context;h.font=i.k;const a=this.hi(t,i,s,n),l=a.ai;return a.li?N(h,l.oi,l._i,l.ui,l.ci,r,l.di,[l.ft,0,0,l.ft],r):N(h,l.fi,l._i,l.ui,l.ci,r,l.di,[0,l.ft,l.ft,0],r),this.Yt.pi&&(h.fillStyle=e,h.fillRect(l.fi,l.mi,l.wi-l.fi,l.gi)),this.Yt.Mi&&(h.fillStyle=i.D,h.fillRect(a.li?l.bi-l.di:0,l._i,l.di,l.Si-l._i)),a}));t.useMediaCoordinateSpace((({context:t})=>{const s=h.xi;t.font=i.k,t.textAlign=h.li?"right":"left",t.textBaseline="middle",t.fillStyle=e,t.fillText(this.Yt.ri,s.Ci,(s._i+s.Si)/2+s.Pi);}));}hi(t,i,s,n){const{context:e,bitmapSize:r,mediaSize:h,horizontalPixelRatio:a,verticalPixelRatio:l}=t,o=this.Yt.pi||!this.Yt.ki?i.C:0,_=this.Yt.yi?i.S:0,u=i.A+this.ei.Ti,c=i.V+this.ei.Ri,d=i.I,f=i.B,p=this.Yt.ri,v=i.P,m=s.Di(e,p),w=Math.ceil(s.Vi(e,p)),g=v+u+c,M=i.S+d+f+w+o,b=Math.max(1,Math.floor(l));let S=Math.round(g*l);S%2!=b%2&&(S+=1);const x=_>0?Math.max(1,Math.floor(_*a)):0,C=Math.round(M*a),P=Math.round(o*a),k=this.ei.Ii??this.ei.Bi,y=Math.round(k*l)-Math.floor(.5*l),T=Math.floor(y+b/2-S/2),R=T+S,D="right"===n,V=D?h.width-_:_,I=D?r.width-x:x;let B,E,A;return D?(B=I-C,E=I-P,A=V-o-d-_):(B=I+C,E=I+P,A=V+o+d),{li:D,ai:{_i:T,mi:y,Si:R,ui:C,ci:S,ft:2*a,di:x,oi:B,fi:I,wi:E,gi:b,bi:r.width},xi:{_i:T/l,Si:R/l,Ci:A,Pi:m}}}}class H{constructor(t){this.Ei={Bi:0,Z:"#000",Ri:0,Ti:0},this.Ai={ri:"",Vt:false,pi:true,ki:false,Ht:"",R:"#FFF",Mi:false,yi:false},this.zi={ri:"",Vt:false,pi:false,ki:true,Ht:"",R:"#FFF",Mi:true,yi:true},this.xt=true,this.Li=new(t||W)(this.Ai,this.Ei),this.Oi=new(t||W)(this.zi,this.Ei);}ri(){return this.Ni(),this.Ai.ri}Bi(){return this.Ni(),this.Ei.Bi}kt(){this.xt=true;}$t(t,i=false){return Math.max(this.Li.$t(t,i),this.Oi.$t(t,i))}Fi(){return this.Ei.Ii||0}Wi(t){this.Ei.Ii=t;}Hi(){return this.Ni(),this.Ai.Vt||this.zi.Vt}Ui(){return this.Ni(),this.Ai.Vt}Tt(t){return this.Ni(),this.Ai.pi=this.Ai.pi&&t.N().ticksVisible,this.zi.pi=this.zi.pi&&t.N().ticksVisible,this.Li.ht(this.Ai,this.Ei),this.Oi.ht(this.zi,this.Ei),this.Li}$i(){return this.Ni(),this.Li.ht(this.Ai,this.Ei),this.Oi.ht(this.zi,this.Ei),this.Oi}Ni(){this.xt&&(this.Ai.pi=true,this.zi.pi=false,this.qi(this.Ai,this.zi,this.Ei));}}class U extends H{constructor(t,i,s){super(),this.Jt=t,this.Yi=i,this.ji=s;}qi(t,i,s){if(t.Vt=false,2===this.Jt.N().mode)return;const n=this.Jt.N().horzLine;if(!n.labelVisible)return;const e=this.Yi.zt();if(!this.Jt.Vt()||this.Yi.Ki()||null===e)return;const r=this.Yi.Xi().X(n.labelBackgroundColor);s.Z=r.Z,t.R=r.G;const h=2/12*this.Yi.P();s.Ti=h,s.Ri=h;const a=this.ji(this.Yi);s.Bi=a.Bi,t.ri=this.Yi.Zi(a.gt,e),t.Vt=true;}}const $=/[1-9]/g;class q{constructor(){this.Yt=null;}ht(t){this.Yt=t;}nt(t,i){if(null===this.Yt||false===this.Yt.Vt||0===this.Yt.ri.length)return;const s=t.useMediaCoordinateSpace((({context:t})=>(t.font=i.k,Math.round(i.Gi.Vi(t,u(this.Yt).ri,$)))));if(s<=0)return;const n=i.Ji,e=s+2*n,r=e/2,h=this.Yt.Qi;let a=this.Yt.Bi,l=Math.floor(a-r)+.5;l<0?(a+=Math.abs(0-l),l=Math.floor(a-r)+.5):l+e>h&&(a-=Math.abs(h-(l+e)),l=Math.floor(a-r)+.5);const o=l+e,_=Math.ceil(0+i.S+i.C+i.A+i.P+i.V);t.useBitmapCoordinateSpace((({context:t,horizontalPixelRatio:s,verticalPixelRatio:n})=>{const e=u(this.Yt);t.fillStyle=e.Z;const r=Math.round(l*s),h=Math.round(0*n),a=Math.round(o*s),c=Math.round(_*n),d=Math.round(2*s);if(t.beginPath(),t.moveTo(r,h),t.lineTo(r,c-d),t.arcTo(r,c,r+d,c,d),t.lineTo(a-d,c),t.arcTo(a,c,a,c-d,d),t.lineTo(a,h),t.fill(),e.pi){const r=Math.round(e.Bi*s),a=h,l=Math.round((a+i.C)*n);t.fillStyle=e.R;const o=Math.max(1,Math.floor(s)),_=Math.floor(.5*s);t.fillRect(r-_,a,o,l-a);}})),t.useMediaCoordinateSpace((({context:t})=>{const s=u(this.Yt),e=0+i.S+i.C+i.A+i.P/2;t.font=i.k,t.textAlign="left",t.textBaseline="middle",t.fillStyle=s.R;const r=i.Gi.Di(t,"Apr0");t.translate(l+n,e+r),t.fillText(s.ri,0,0);}));}}class Y{constructor(t,i,s){this.xt=true,this.Gt=new q,this.Zt={Vt:false,Z:"#4c525e",R:"white",ri:"",Qi:0,Bi:NaN,pi:true},this.Ct=t,this.ts=i,this.ji=s;}kt(){this.xt=true;}Tt(){return this.xt&&(this.Rt(),this.xt=false),this.Gt.ht(this.Zt),this.Gt}Rt(){const t=this.Zt;if(t.Vt=false,2===this.Ct.N().mode)return;const i=this.Ct.N().vertLine;if(!i.labelVisible)return;const s=this.ts.Et();if(s.Ki())return;t.Qi=s.Qi();const n=this.ji();if(null===n)return;t.Bi=n.Bi;const e=s.ss(this.Ct.Bt());t.ri=s.ns(u(e)),t.Vt=true;const r=this.ts.Xi().X(i.labelBackgroundColor);t.Z=r.Z,t.R=r.G,t.pi=s.N().ticksVisible;}}class j{constructor(){this.es=null,this.rs=0;}hs(){return this.rs}ls(t){this.rs=t;}Ft(){return this.es}_s(t){this.es=t;}us(t){return []}cs(){return []}Vt(){return  true}}var K;!function(t){t[t.Normal=0]="Normal",t[t.Magnet=1]="Magnet",t[t.Hidden=2]="Hidden",t[t.MagnetOHLC=3]="MagnetOHLC";}(K||(K={}));class X extends j{constructor(t,i){super(),this.Pt=null,this.ds=NaN,this.fs=0,this.ps=false,this.vs=new Map,this.ws=false,this.gs=new WeakMap,this.Ms=new WeakMap,this.bs=NaN,this.Ss=NaN,this.xs=NaN,this.Cs=NaN,this.ts=t,this.Ps=i;this.ks=((t,i)=>s=>{const n=i(),e=t();if(s===u(this.Pt).ys())return {gt:e,Bi:n};{const t=u(s.zt());return {gt:s.Ts(n,t),Bi:n}}})((()=>this.ds),(()=>this.Ss));const s=((t,i)=>()=>{const s=this.ts.Et().Rs(t()),n=i();return s&&Number.isFinite(n)?{wt:s,Bi:n}:null})((()=>this.fs),(()=>this.si()));this.Ds=new Y(this,t,s);}N(){return this.Ps}Vs(t,i){this.xs=t,this.Cs=i;}Is(){this.xs=NaN,this.Cs=NaN;}Bs(){return this.xs}Es(){return this.Cs}As(t,i,s){this.ws||(this.ws=true),this.ps=true,this.zs(t,i,s);}Bt(){return this.fs}si(){return this.bs}ni(){return this.Ss}Vt(){return this.ps}Ls(){this.ps=false,this.Os(),this.ds=NaN,this.bs=NaN,this.Ss=NaN,this.Pt=null,this.Is(),this.Ns();}Fs(t){let i=this.gs.get(t);i||(i=new A(this,t),this.gs.set(t,i));let s=this.Ms.get(t);return s||(s=new B(this.ts,this,t),this.Ms.set(t,s)),[i,s]}ti(t){return t===this.Pt&&this.Ps.horzLine.visible}ii(){return this.Ps.vertLine.visible}Ws(t,i){this.ps&&this.Pt===t||this.vs.clear();const s=[];return this.Pt===t&&s.push(this.Hs(this.vs,i,this.ks)),s}cs(){return this.ps?[this.Ds]:[]}Us(){return this.Pt}Ns(){this.ts.$s().forEach((t=>{this.gs.get(t)?.kt(),this.Ms.get(t)?.kt();})),this.vs.forEach((t=>t.kt())),this.Ds.kt();}qs(t){return t&&!t.ys().Ki()?t.ys():null}zs(t,i,s){this.Ys(t,i,s)&&this.Ns();}Ys(t,i,s){const n=this.bs,e=this.Ss,r=this.ds,h=this.fs,a=this.Pt,l=this.qs(s);this.fs=t,this.bs=isNaN(t)?NaN:this.ts.Et().qt(t),this.Pt=s;const o=null!==l?l.zt():null;return null!==l&&null!==o?(this.ds=i,this.Ss=l.Nt(i,o)):(this.ds=NaN,this.Ss=NaN),n!==this.bs||e!==this.Ss||h!==this.fs||r!==this.ds||a!==this.Pt}Os(){const t=this.ts.js().map((t=>t.Xs().Ks())).filter(M),i=0===t.length?null:Math.max(...t);this.fs=null!==i?i:NaN;}Hs(t,i,s){let n=t.get(i);return void 0===n&&(n=new U(this,i,s),t.set(i,n)),n}}function Z(t){return "left"===t||"right"===t}class G{constructor(t){this.Zs=new Map,this.Gs=[],this.Js=t;}Qs(t,i){const s=function(t,i){return void 0===t?i:{tn:Math.max(t.tn,i.tn),sn:t.sn||i.sn}}(this.Zs.get(t),i);this.Zs.set(t,s);}nn(){return this.Js}en(t){const i=this.Zs.get(t);return void 0===i?{tn:this.Js}:{tn:Math.max(this.Js,i.tn),sn:i.sn}}rn(){this.hn(),this.Gs=[{an:0}];}ln(t){this.hn(),this.Gs=[{an:1,Wt:t}];}_n(t){this.un(),this.Gs.push({an:5,Wt:t});}hn(){this.un(),this.Gs.push({an:6});}cn(){this.hn(),this.Gs=[{an:4}];}dn(t){this.hn(),this.Gs.push({an:2,Wt:t});}fn(t){this.hn(),this.Gs.push({an:3,Wt:t});}pn(){return this.Gs}vn(t){for(const i of t.Gs)this.mn(i);this.Js=Math.max(this.Js,t.Js),t.Zs.forEach(((t,i)=>{this.Qs(i,t);}));}static wn(){return new G(2)}static gn(){return new G(3)}mn(t){switch(t.an){case 0:this.rn();break;case 1:this.ln(t.Wt);break;case 2:this.dn(t.Wt);break;case 3:this.fn(t.Wt);break;case 4:this.cn();break;case 5:this._n(t.Wt);break;case 6:this.un();}}un(){const t=this.Gs.findIndex((t=>5===t.an));-1!==t&&this.Gs.splice(t,1);}}class J{formatTickmarks(t){return t.map((t=>this.format(t)))}}const Q=".";function tt(t,i){if(!p(t))return "n/a";if(!v(i))throw new TypeError("invalid length");if(i<0||i>16)throw new TypeError("invalid length");if(0===i)return t.toString();return ("0000000000000000"+t.toString()).slice(-i)}class it extends J{constructor(t,i){if(super(),i||(i=1),p(t)&&v(t)||(t=100),t<0)throw new TypeError("invalid base");this.Yi=t,this.Mn=i,this.bn();}format(t){const i=t<0?"−":"";return t=Math.abs(t),i+this.Sn(t)}bn(){if(this.xn=0,this.Yi>0&&this.Mn>0){let t=this.Yi;for(;t>1;)t/=10,this.xn++;}}Sn(t){const i=this.Yi/this.Mn;let s=Math.floor(t),n="";const e=void 0!==this.xn?this.xn:NaN;if(i>1){let r=+(Math.round(t*i)-s*i).toFixed(this.xn);r>=i&&(r-=i,s+=1),n=Q+tt(+r.toFixed(this.xn)*this.Mn,e);}else s=Math.round(s*i)/i,e>0&&(n=Q+tt(0,e));return s.toFixed(0)+n}}class st extends it{constructor(t=100){super(t);}format(t){return `${super.format(t)}%`}}class nt extends J{constructor(t){super(),this.Cn=t;}format(t){let i="";return t<0&&(i="-",t=-t),t<995?i+this.Pn(t):t<999995?i+this.Pn(t/1e3)+"K":t<999999995?(t=1e3*Math.round(t/1e3),i+this.Pn(t/1e6)+"M"):(t=1e6*Math.round(t/1e6),i+this.Pn(t/1e9)+"B")}Pn(t){let i;const s=Math.pow(10,this.Cn);return i=(t=Math.round(t*s)/s)>=1e-15&&t<1?t.toFixed(this.Cn).replace(/\.?0+$/,""):String(t),i.replace(/(\.[1-9]*)0+$/,((t,i)=>i))}}const et=/[2-9]/g;class rt{constructor(t=50){this.kn=0,this.yn=1,this.Tn=1,this.Rn={},this.Dn=new Map,this.Vn=t;}In(){this.kn=0,this.Dn.clear(),this.yn=1,this.Tn=1,this.Rn={};}Vi(t,i,s){return this.Bn(t,i,s).width}Di(t,i,s){const n=this.Bn(t,i,s);return ((n.actualBoundingBoxAscent||0)-(n.actualBoundingBoxDescent||0))/2}Bn(t,i,s){const n=s||et,e=String(i).replace(n,"0");if(this.Dn.has(e))return _(this.Dn.get(e)).En;if(this.kn===this.Vn){const t=this.Rn[this.Tn];delete this.Rn[this.Tn],this.Dn.delete(t),this.Tn++,this.kn--;}t.save(),t.textBaseline="middle";const r=t.measureText(e);return t.restore(),0===r.width&&i.length||(this.Dn.set(e,{En:r,An:this.yn}),this.Rn[this.yn]=e,this.kn++,this.yn++),r}}class ht{constructor(t){this.zn=null,this.M=null,this.Ln="right",this.On=t;}Nn(t,i,s){this.zn=t,this.M=i,this.Ln=s;}nt(t){null!==this.M&&null!==this.zn&&this.zn.nt(t,this.M,this.On,this.Ln);}}class at{constructor(t,i,s){this.Fn=t,this.On=new rt(50),this.Wn=i,this.O=s,this.F=-1,this.Gt=new ht(this.On);}Tt(){const t=this.O.Hn(this.Wn);if(null===t)return null;const i=t.Un(this.Wn)?t.$n():this.Wn.Ft();if(null===i)return null;const s=t.qn(i);if("overlay"===s)return null;const n=this.O.Yn();return n.P!==this.F&&(this.F=n.P,this.On.In()),this.Gt.Nn(this.Fn.$i(),n,s),this.Gt}}class lt extends R{constructor(){super(...arguments),this.Yt=null;}ht(t){this.Yt=t;}jn(t,i){if(!this.Yt?.Vt)return null;const{ut:s,ct:n,Kn:e}=this.Yt;return i>=s-n-7&&i<=s+n+7?{Xn:this.Yt,Kn:e}:null}et({context:t,bitmapSize:i,horizontalPixelRatio:s,verticalPixelRatio:n}){if(null===this.Yt)return;if(false===this.Yt.Vt)return;const e=Math.round(this.Yt.ut*n);e<0||e>i.height||(t.lineCap="butt",t.strokeStyle=this.Yt.R,t.lineWidth=Math.floor(this.Yt.ct*s),a(t,this.Yt.Xt),l(t,e,0,i.width));}}class ot{constructor(t){this.Zn={ut:0,R:"rgba(0, 0, 0, 0)",ct:1,Xt:0,Vt:false},this.Gn=new lt,this.xt=true,this.Jn=t,this.Qn=t.Qt(),this.Gn.ht(this.Zn);}kt(){this.xt=true;}Tt(){return this.Jn.Vt()?(this.xt&&(this.te(),this.xt=false),this.Gn):null}}class _t extends ot{constructor(t){super(t);}te(){this.Zn.Vt=false;const t=this.Jn.Ft(),i=t.ie().ie;if(2!==i&&3!==i)return;const s=this.Jn.N();if(!s.baseLineVisible||!this.Jn.Vt())return;const n=this.Jn.zt();null!==n&&(this.Zn.Vt=true,this.Zn.ut=t.Nt(n.Wt,n.Wt),this.Zn.R=s.baseLineColor,this.Zn.ct=s.baseLineWidth,this.Zn.Xt=s.baseLineStyle);}}class ut extends R{constructor(){super(...arguments),this.Yt=null;}ht(t){this.Yt=t;}se(){return this.Yt}et({context:t,horizontalPixelRatio:i,verticalPixelRatio:s}){const n=this.Yt;if(null===n)return;const e=Math.max(1,Math.floor(i)),r=e%2/2,h=Math.round(n.ne.x*i)+r,a=n.ne.y*s;t.fillStyle=n.ee,t.beginPath();const l=Math.max(2,1.5*n.re)*i;t.arc(h,a,l,0,2*Math.PI,false),t.fill(),t.fillStyle=n.he,t.beginPath(),t.arc(h,a,n.ft*i,0,2*Math.PI,false),t.fill(),t.lineWidth=e,t.strokeStyle=n.ae,t.beginPath(),t.arc(h,a,n.ft*i+e/2,0,2*Math.PI,false),t.stroke();}}const ct=[{le:0,oe:.25,_e:4,ue:10,ce:.25,de:0,fe:.4,pe:.8},{le:.25,oe:.525,_e:10,ue:14,ce:0,de:0,fe:.8,pe:0},{le:.525,oe:1,_e:14,ue:14,ce:0,de:0,fe:0,pe:0}];class dt{constructor(t){this.Gt=new ut,this.xt=true,this.ve=true,this.me=performance.now(),this.we=this.me-1,this.ge=t;}Me(){this.we=this.me-1,this.kt();}be(){if(this.kt(),2===this.ge.N().lastPriceAnimation){const t=performance.now(),i=this.we-t;if(i>0)return void(i<650&&(this.we+=2600));this.me=t,this.we=t+2600;}}kt(){this.xt=true;}Se(){this.ve=true;}Vt(){return 0!==this.ge.N().lastPriceAnimation}xe(){switch(this.ge.N().lastPriceAnimation){case 0:return  false;case 1:return  true;case 2:return performance.now()<=this.we}}Tt(){return this.xt?(this.Rt(),this.xt=false,this.ve=false):this.ve&&(this.Ce(),this.ve=false),this.Gt}Rt(){this.Gt.ht(null);const t=this.ge.Qt().Et(),i=t.Pe(),s=this.ge.zt();if(null===i||null===s)return;const n=this.ge.ke(true);if(n.ye||!i.Te(n.Re))return;const e={x:t.qt(n.Re),y:this.ge.Ft().Nt(n.gt,s.Wt)},r=n.R,h=this.ge.N().lineWidth,a=this.De(this.Ve(),r);this.Gt.ht({ee:r,re:h,he:a.he,ae:a.ae,ft:a.ft,ne:e});}Ce(){const t=this.Gt.se();if(null!==t){const i=this.De(this.Ve(),t.ee);t.he=i.he,t.ae=i.ae,t.ft=i.ft;}}Ve(){return this.xe()?performance.now()-this.me:2599}Ie(t,i,s,n){const e=s+(n-s)*i;return this.ge.Qt().Xi().j(t,e)}De(t,i){const s=t%2600/2600;let n;for(const t of ct)if(s>=t.le&&s<=t.oe){n=t;break}o(void 0!==n,"Last price animation internal logic error");const e=(s-n.le)/(n.oe-n.le);return {he:this.Ie(i,e,n.ce,n.de),ae:this.Ie(i,e,n.fe,n.pe),ft:(r=e,h=n._e,a=n.ue,h+(a-h)*r)};var r,h,a;}}class ft extends ot{constructor(t){super(t);}te(){const t=this.Zn;t.Vt=false;const i=this.Jn.N();if(!i.priceLineVisible||!this.Jn.Vt())return;const s=this.Jn.ke(0===i.priceLineSource);s.ye||(t.Vt=true,t.ut=s.Bi,t.R=this.Jn.Be(s.R),t.ct=i.priceLineWidth,t.Xt=i.priceLineStyle);}}class pt extends H{constructor(t){super(),this.Jt=t;}qi(t,i,s){t.Vt=false,i.Vt=false;const n=this.Jt;if(!n.Vt())return;const e=n.N(),r=e.lastValueVisible,h=""!==n.Ee(),a=0===e.seriesLastValueMode,l=n.ke(false);if(l.ye)return;r&&(t.ri=this.Ae(l,r,a),t.Vt=0!==t.ri.length),(h||a)&&(i.ri=this.ze(l,r,h,a),i.Vt=i.ri.length>0);const o=n.Be(l.R),_=this.Jt.Qt().Xi().X(o);s.Z=_.Z,s.Bi=l.Bi,i.Ht=n.Qt().Ut(l.Bi/n.Ft().$t()),t.Ht=o,t.R=_.G,i.R=_.G;}ze(t,i,s,n){let e="";const r=this.Jt.Ee();return s&&0!==r.length&&(e+=`${r} `),i&&n&&(e+=this.Jt.Ft().Le()?t.Oe:t.Ne),e.trim()}Ae(t,i,s){return i?s?this.Jt.Ft().Le()?t.Ne:t.Oe:t.ri:""}}function vt(t,i,s,n){const e=Number.isFinite(i),r=Number.isFinite(s);return e&&r?t(i,s):e||r?e?i:s:n}class mt{constructor(t,i){this.Fe=t,this.We=i;}He(t){return null!==t&&(this.Fe===t.Fe&&this.We===t.We)}Ue(){return new mt(this.Fe,this.We)}$e(){return this.Fe}qe(){return this.We}Ye(){return this.We-this.Fe}Ki(){return this.We===this.Fe||Number.isNaN(this.We)||Number.isNaN(this.Fe)}vn(t){return null===t?this:new mt(vt(Math.min,this.$e(),t.$e(),-1/0),vt(Math.max,this.qe(),t.qe(),1/0))}je(t){if(!p(t))return;if(0===this.We-this.Fe)return;const i=.5*(this.We+this.Fe);let s=this.We-i,n=this.Fe-i;s*=t,n*=t,this.We=i+s,this.Fe=i+n;}Ke(t){p(t)&&(this.We+=t,this.Fe+=t);}Xe(){return {minValue:this.Fe,maxValue:this.We}}static Ze(t){return null===t?null:new mt(t.minValue,t.maxValue)}}class wt{constructor(t,i){this.Ge=t,this.Je=i||null;}Qe(){return this.Ge}tr(){return this.Je}Xe(){return {priceRange:null===this.Ge?null:this.Ge.Xe(),margins:this.Je||void 0}}static Ze(t){return null===t?null:new wt(mt.Ze(t.priceRange),t.margins)}}class gt extends ot{constructor(t,i){super(t),this.ir=i;}te(){const t=this.Zn;t.Vt=false;const i=this.ir.N();if(!this.Jn.Vt()||!i.lineVisible)return;const s=this.ir.sr();null!==s&&(t.Vt=true,t.ut=s,t.R=i.color,t.ct=i.lineWidth,t.Xt=i.lineStyle,t.Kn=this.ir.N().id);}}class Mt extends H{constructor(t,i){super(),this.ge=t,this.ir=i;}qi(t,i,s){t.Vt=false,i.Vt=false;const n=this.ir.N(),e=n.axisLabelVisible,r=""!==n.title,h=this.ge;if(!e||!h.Vt())return;const a=this.ir.sr();if(null===a)return;r&&(i.ri=n.title,i.Vt=true),i.Ht=h.Qt().Ut(a/h.Ft().$t()),t.ri=this.nr(n.price),t.Vt=true;const l=this.ge.Qt().Xi().X(n.axisLabelColor||n.color);s.Z=l.Z;const o=n.axisLabelTextColor||l.G;t.R=o,i.R=o,s.Bi=a;}nr(t){const i=this.ge.zt();return null===i?"":this.ge.Ft().Zi(t,i.Wt)}}class bt{constructor(t,i){this.ge=t,this.Ps=i,this.er=new gt(t,this),this.Fn=new Mt(t,this),this.rr=new at(this.Fn,t,t.Qt());}hr(t){f(this.Ps,t),this.kt(),this.ge.Qt().ar();}N(){return this.Ps}lr(){return this.er}_r(){return this.rr}ur(){return this.Fn}kt(){this.er.kt(),this.Fn.kt();}sr(){const t=this.ge,i=t.Ft();if(t.Qt().Et().Ki()||i.Ki())return null;const s=t.zt();return null===s?null:i.Nt(this.Ps.price,s.Wt)}}class St extends j{constructor(t){super(),this.ts=t;}Qt(){return this.ts}}const xt={Bar:(t,i,s,n)=>{const e=i.upColor,r=i.downColor,h=u(t(s,n)),a=c(h.Wt[0])<=c(h.Wt[3]);return {cr:h.R??(a?e:r)}},Candlestick:(t,i,s,n)=>{const e=i.upColor,r=i.downColor,h=i.borderUpColor,a=i.borderDownColor,l=i.wickUpColor,o=i.wickDownColor,_=u(t(s,n)),d=c(_.Wt[0])<=c(_.Wt[3]);return {cr:_.R??(d?e:r),dr:_.Ht??(d?h:a),pr:_.vr??(d?l:o)}},Custom:(t,i,s,n)=>({cr:u(t(s,n)).R??i.color}),Area:(t,i,s,n)=>{const e=u(t(s,n));return {cr:e.vt??i.lineColor,vt:e.vt??i.lineColor,mr:e.mr??i.topColor,wr:e.wr??i.bottomColor}},Baseline:(t,i,s,n)=>{const e=u(t(s,n));return {cr:e.Wt[3]>=i.baseValue.price?i.topLineColor:i.bottomLineColor,gr:e.gr??i.topLineColor,Mr:e.Mr??i.bottomLineColor,br:e.br??i.topFillColor1,Sr:e.Sr??i.topFillColor2,Cr:e.Cr??i.bottomFillColor1,Pr:e.Pr??i.bottomFillColor2}},Line:(t,i,s,n)=>{const e=u(t(s,n));return {cr:e.R??i.color,vt:e.R??i.color}},Histogram:(t,i,s,n)=>({cr:u(t(s,n)).R??i.color})};class Ct{constructor(t){this.kr=(t,i)=>void 0!==i?i.Wt:this.ge.Xs().yr(t),this.ge=t,this.Tr=xt[t.Rr()];}Dr(t,i){return this.Tr(this.kr,this.ge.N(),t,i)}}function Pt(t,i,s,n,e=0,r=i.length){let h=r-e;for(;0<h;){const r=h>>1,a=e+r;n(i[a],s)===t?(e=a+1,h-=r+1):h=r;}return e}const kt=Pt.bind(null,true),yt=Pt.bind(null,false);var Tt;!function(t){t[t.NearestLeft=-1]="NearestLeft",t[t.None=0]="None",t[t.NearestRight=1]="NearestRight";}(Tt||(Tt={}));const Rt=30;class Dt{constructor(){this.Vr=[],this.Ir=new Map,this.Br=new Map,this.Er=[];}Ar(){return this.zr()>0?this.Vr[this.Vr.length-1]:null}Lr(){return this.zr()>0?this.Or(0):null}Ks(){return this.zr()>0?this.Or(this.Vr.length-1):null}zr(){return this.Vr.length}Ki(){return 0===this.zr()}Te(t){return null!==this.Nr(t,0)}yr(t){return this.Fr(t)}Fr(t,i=0){const s=this.Nr(t,i);return null===s?null:{...this.Wr(s),Re:this.Or(s)}}Hr(){return this.Vr}Ur(t,i,s){if(this.Ki())return null;let n=null;for(const e of s){n=Vt(n,this.$r(t,i,e));}return n}ht(t){this.Br.clear(),this.Ir.clear(),this.Vr=t,this.Er=t.map((t=>t.Re));}qr(){return this.Er}Or(t){return this.Vr[t].Re}Wr(t){return this.Vr[t]}Nr(t,i){const s=this.Yr(t);if(null===s&&0!==i)switch(i){case  -1:return this.jr(t);case 1:return this.Kr(t);default:throw new TypeError("Unknown search mode")}return s}jr(t){let i=this.Xr(t);return i>0&&(i-=1),i!==this.Vr.length&&this.Or(i)<t?i:null}Kr(t){const i=this.Zr(t);return i!==this.Vr.length&&t<this.Or(i)?i:null}Yr(t){const i=this.Xr(t);return i===this.Vr.length||t<this.Vr[i].Re?null:i}Xr(t){return kt(this.Vr,t,((t,i)=>t.Re<i))}Zr(t){return yt(this.Vr,t,((t,i)=>t.Re>i))}Gr(t,i,s){let n=null;for(let e=t;e<i;e++){const t=this.Vr[e].Wt[s];Number.isNaN(t)||(null===n?n={Jr:t,Qr:t}:(t<n.Jr&&(n.Jr=t),t>n.Qr&&(n.Qr=t)));}return n}$r(t,i,s){if(this.Ki())return null;let n=null;const e=u(this.Lr()),r=u(this.Ks()),h=Math.max(t,e),a=Math.min(i,r),l=Math.ceil(h/Rt)*Rt,o=Math.max(l,Math.floor(a/Rt)*Rt);{const t=this.Xr(h),e=this.Zr(Math.min(a,l,i));n=Vt(n,this.Gr(t,e,s));}let _=this.Ir.get(s);void 0===_&&(_=new Map,this.Ir.set(s,_));for(let t=Math.max(l+1,h);t<o;t+=Rt){const i=Math.floor(t/Rt);let e=_.get(i);if(void 0===e){const t=this.Xr(i*Rt),n=this.Zr((i+1)*Rt-1);e=this.Gr(t,n,s),_.set(i,e);}n=Vt(n,e);}{const t=this.Xr(o),i=this.Zr(a);n=Vt(n,this.Gr(t,i,s));}return n}}function Vt(t,i){if(null===t)return i;if(null===i)return t;return {Jr:Math.min(t.Jr,i.Jr),Qr:Math.max(t.Qr,i.Qr)}}class It{constructor(t){this.th=t;}nt(t,i,s){this.th.draw(t);}ih(t,i,s){this.th.drawBackground?.(t);}}class Bt{constructor(t){this.Dn=null,this.sh=t;}Tt(){const t=this.sh.renderer();if(null===t)return null;if(this.Dn?.nh===t)return this.Dn.eh;const i=new It(t);return this.Dn={nh:t,eh:i},i}rh(){return this.sh.zOrder?.()??"normal"}}class Et{constructor(t){this.hh=null,this.ah=t;}oh(){return this.ah}Ns(){this.ah.updateAllViews?.();}Fs(){const t=this.ah.paneViews?.()??[];if(this.hh?.nh===t)return this.hh.eh;const i=t.map((t=>new Bt(t)));return this.hh={nh:t,eh:i},i}jn(t,i){return this.ah.hitTest?.(t,i)??null}}let At=class extends Et{us(){return []}};class zt{constructor(t){this.th=t;}nt(t,i,s){this.th.draw(t);}ih(t,i,s){this.th.drawBackground?.(t);}}class Lt{constructor(t){this.Dn=null,this.sh=t;}Tt(){const t=this.sh.renderer();if(null===t)return null;if(this.Dn?.nh===t)return this.Dn.eh;const i=new zt(t);return this.Dn={nh:t,eh:i},i}rh(){return this.sh.zOrder?.()??"normal"}}function Ot(t){return {ri:t.text(),Bi:t.coordinate(),Ii:t.fixedCoordinate?.(),R:t.textColor(),Z:t.backColor(),Vt:t.visible?.()??true,pi:t.tickVisible?.()??true}}class Nt{constructor(t,i){this.Gt=new q,this._h=t,this.uh=i;}Tt(){return this.Gt.ht({Qi:this.uh.Qi(),...Ot(this._h)}),this.Gt}}class Ft extends H{constructor(t,i){super(),this._h=t,this.Yi=i;}qi(t,i,s){const n=Ot(this._h);s.Z=n.Z,t.R=n.R;const e=2/12*this.Yi.P();s.Ti=e,s.Ri=e,s.Bi=n.Bi,s.Ii=n.Ii,t.ri=n.ri,t.Vt=n.Vt,t.pi=n.pi;}}class Wt extends Et{constructor(t,i){super(t),this.dh=null,this.fh=null,this.ph=null,this.mh=null,this.ge=i;}cs(){const t=this.ah.timeAxisViews?.()??[];if(this.dh?.nh===t)return this.dh.eh;const i=this.ge.Qt().Et(),s=t.map((t=>new Nt(t,i)));return this.dh={nh:t,eh:s},s}Ws(){const t=this.ah.priceAxisViews?.()??[];if(this.fh?.nh===t)return this.fh.eh;const i=this.ge.Ft(),s=t.map((t=>new Ft(t,i)));return this.fh={nh:t,eh:s},s}wh(){const t=this.ah.priceAxisPaneViews?.()??[];if(this.ph?.nh===t)return this.ph.eh;const i=t.map((t=>new Lt(t)));return this.ph={nh:t,eh:i},i}gh(){const t=this.ah.timeAxisPaneViews?.()??[];if(this.mh?.nh===t)return this.mh.eh;const i=t.map((t=>new Lt(t)));return this.mh={nh:t,eh:i},i}Mh(t,i){return this.ah.autoscaleInfo?.(t,i)??null}}function Ht(t,i,s,n){t.forEach((t=>{i(t).forEach((t=>{t.rh()===s&&n.push(t);}));}));}function Ut(t){return t.Fs()}function $t(t){return t.wh()}function qt(t){return t.gh()}const Yt=["Area","Line","Baseline"];class jt extends St{constructor(t,i,s,n,e){super(t),this.Yt=new Dt,this.er=new ft(this),this.bh=[],this.Sh=new _t(this),this.xh=null,this.Ch=null,this.Ph=null,this.kh=[],this.Ps=s,this.yh=i;const r=new pt(this);this.vs=[r],this.rr=new at(r,this,t),Yt.includes(this.yh)&&(this.xh=new dt(this)),this.Th(),this.sh=n(this,this.Qt(),e);}m(){null!==this.Ph&&clearTimeout(this.Ph);}Be(t){return this.Ps.priceLineColor||t}ke(t){const i={ye:true},s=this.Ft();if(this.Qt().Et().Ki()||s.Ki()||this.Yt.Ki())return i;const n=this.Qt().Et().Pe(),e=this.zt();if(null===n||null===e)return i;let r,h;if(t){const t=this.Yt.Ar();if(null===t)return i;r=t,h=t.Re;}else {const t=this.Yt.Fr(n.bi(),-1);if(null===t)return i;if(r=this.Yt.yr(t.Re),null===r)return i;h=t.Re;}const a=r.Wt[3],l=this.Rh().Dr(h,{Wt:r}),o=s.Nt(a,e.Wt);return {ye:false,gt:a,ri:s.Zi(a,e.Wt),Oe:s.Dh(a),Ne:s.Vh(a,e.Wt),R:l.cr,Bi:o,Re:h}}Rh(){return null!==this.Ch||(this.Ch=new Ct(this)),this.Ch}N(){return this.Ps}hr(t){const i=t.priceScaleId;void 0!==i&&i!==this.Ps.priceScaleId&&this.Qt().Ih(this,i),f(this.Ps,t),void 0!==t.priceFormat&&(this.Th(),this.Qt().Bh()),this.Qt().Eh(this),this.Qt().Ah(),this.sh.kt("options");}ht(t,i){this.Yt.ht(t),this.sh.kt("data"),null!==this.xh&&(i&&i.zh?this.xh.be():0===t.length&&this.xh.Me());const s=this.Qt().Hn(this);this.Qt().Lh(s),this.Qt().Eh(this),this.Qt().Ah(),this.Qt().ar();}Oh(t){const i=new bt(this,t);return this.bh.push(i),this.Qt().Eh(this),i}Nh(t){const i=this.bh.indexOf(t);-1!==i&&this.bh.splice(i,1),this.Qt().Eh(this);}Fh(){return this.bh}Rr(){return this.yh}zt(){const t=this.Wh();return null===t?null:{Wt:t.Wt[3],Hh:t.wt}}Wh(){const t=this.Qt().Et().Pe();if(null===t)return null;const i=t.Uh();return this.Yt.Fr(i,1)}Xs(){return this.Yt}$h(t){const i=this.Yt.yr(t);return null===i?null:"Bar"===this.yh||"Candlestick"===this.yh||"Custom"===this.yh?{qh:i.Wt[0],Yh:i.Wt[1],jh:i.Wt[2],Kh:i.Wt[3]}:i.Wt[3]}Xh(t){const i=[];Ht(this.kh,Ut,"top",i);const s=this.xh;return null!==s&&s.Vt()?(null===this.Ph&&s.xe()&&(this.Ph=setTimeout((()=>{this.Ph=null,this.Qt().Zh();}),0)),s.Se(),i.unshift(s),i):i}Fs(){const t=[];this.Gh()||t.push(this.Sh),t.push(this.sh,this.er);const i=this.bh.map((t=>t.lr()));return t.push(...i),Ht(this.kh,Ut,"normal",t),t}Jh(){return this.Qh(Ut,"bottom")}ta(t){return this.Qh($t,t)}ia(t){return this.Qh(qt,t)}sa(t,i){return this.kh.map((s=>s.jn(t,i))).filter((t=>null!==t))}us(){return [this.rr,...this.bh.map((t=>t._r()))]}Ws(t,i){if(i!==this.es&&!this.Gh())return [];const s=[...this.vs];for(const t of this.bh)s.push(t.ur());return this.kh.forEach((t=>{s.push(...t.Ws());})),s}cs(){const t=[];return this.kh.forEach((i=>{t.push(...i.cs());})),t}Mh(t,i){if(void 0!==this.Ps.autoscaleInfoProvider){const s=this.Ps.autoscaleInfoProvider((()=>{const s=this.na(t,i);return null===s?null:s.Xe()}));return wt.Ze(s)}return this.na(t,i)}ea(){return this.Ps.priceFormat.minMove}ra(){return this.ha}Ns(){this.sh.kt();for(const t of this.vs)t.kt();for(const t of this.bh)t.kt();this.er.kt(),this.Sh.kt(),this.xh?.kt(),this.kh.forEach((t=>t.Ns()));}Ft(){return u(super.Ft())}At(t){if(!(("Line"===this.yh||"Area"===this.yh||"Baseline"===this.yh)&&this.Ps.crosshairMarkerVisible))return null;const i=this.Yt.yr(t);if(null===i)return null;return {gt:i.Wt[3],ft:this.aa(),Ht:this.la(),Ot:this.oa(),Lt:this._a(t)}}Ee(){return this.Ps.title}Vt(){return this.Ps.visible}ua(t){this.kh.push(new Wt(t,this));}ca(t){this.kh=this.kh.filter((i=>i.oh()!==t));}da(){if("Custom"===this.yh)return t=>this.sh.fa(t)}pa(){if("Custom"===this.yh)return t=>this.sh.va(t)}ma(){return this.Yt.qr()}Gh(){return !Z(this.Ft().wa())}na(t,i){if(!v(t)||!v(i)||this.Yt.Ki())return null;const s="Line"===this.yh||"Area"===this.yh||"Baseline"===this.yh||"Histogram"===this.yh?[3]:[2,1],n=this.Yt.Ur(t,i,s);let e=null!==n?new mt(n.Jr,n.Qr):null,r=null;if("Histogram"===this.Rr()){const t=this.Ps.base,i=new mt(t,t);e=null!==e?e.vn(i):i;}return this.kh.forEach((s=>{const n=s.Mh(t,i);if(n?.priceRange){const t=new mt(n.priceRange.minValue,n.priceRange.maxValue);e=null!==e?e.vn(t):t;}n?.margins&&(r=n.margins);})),new wt(e,r)}aa(){switch(this.yh){case "Line":case "Area":case "Baseline":return this.Ps.crosshairMarkerRadius}return 0}la(){switch(this.yh){case "Line":case "Area":case "Baseline":{const t=this.Ps.crosshairMarkerBorderColor;if(0!==t.length)return t}}return null}oa(){switch(this.yh){case "Line":case "Area":case "Baseline":return this.Ps.crosshairMarkerBorderWidth}return 0}_a(t){switch(this.yh){case "Line":case "Area":case "Baseline":{const t=this.Ps.crosshairMarkerBackgroundColor;if(0!==t.length)return t}}return this.Rh().Dr(t).cr}Th(){switch(this.Ps.priceFormat.type){case "custom":{const t=this.Ps.priceFormat.formatter;this.ha={format:t,formatTickmarks:this.Ps.priceFormat.tickmarksFormatter??(i=>i.map(t))};break}case "volume":this.ha=new nt(this.Ps.priceFormat.precision);break;case "percent":this.ha=new st(this.Ps.priceFormat.precision);break;default:{const t=Math.pow(10,this.Ps.priceFormat.precision);this.ha=new it(t,this.Ps.priceFormat.minMove*t);}}null!==this.es&&this.es.ga();}Qh(t,i){const s=[];return Ht(this.kh,t,i,s),s}}const Kt=[3],Xt=[0,1,2,3];class Zt{constructor(t){this.Ps=t;}Ma(t,i,s){let n=t;if(0===this.Ps.mode)return n;const e=s.ys(),r=e.zt();if(null===r)return n;const h=e.Nt(t,r),a=s.ba().filter((t=>t instanceof jt)).reduce(((t,n)=>{if(s.Un(n)||!n.Vt())return t;const e=n.Ft(),r=n.Xs();if(e.Ki()||!r.Te(i))return t;const h=r.yr(i);if(null===h)return t;const a=c(n.zt()),l=3===this.Ps.mode?Xt:Kt;return t.concat(l.map((t=>e.Nt(h.Wt[t],a.Wt))))}),[]);if(0===a.length)return n;a.sort(((t,i)=>Math.abs(t-h)-Math.abs(i-h)));const l=a[0];return n=e.Ts(l,r),n}}function Gt(t,i,s){return Math.min(Math.max(t,i),s)}function Jt(t,i,s){return i-t<=s}function Qt(t){const i=Math.ceil(t);return i%2==0?i-1:i}class ti extends R{constructor(){super(...arguments),this.Yt=null;}ht(t){this.Yt=t;}et({context:t,bitmapSize:i,horizontalPixelRatio:s,verticalPixelRatio:n}){if(null===this.Yt)return;const e=Math.max(1,Math.floor(s));t.lineWidth=e,function(t,i){t.save(),t.lineWidth%2&&t.translate(.5,.5),i(),t.restore();}(t,(()=>{const r=u(this.Yt);if(r.Sa){t.strokeStyle=r.xa,a(t,r.Ca),t.beginPath();for(const n of r.Pa){const r=Math.round(n.ka*s);t.moveTo(r,-e),t.lineTo(r,i.height+e);}t.stroke();}if(r.ya){t.strokeStyle=r.Ta,a(t,r.Ra),t.beginPath();for(const s of r.Da){const r=Math.round(s.ka*n);t.moveTo(-e,r),t.lineTo(i.width+e,r);}t.stroke();}}));}}class ii{constructor(t){this.Gt=new ti,this.xt=true,this.Pt=t;}kt(){this.xt=true;}Tt(){if(this.xt){const t=this.Pt.Qt().N().grid,i={ya:t.horzLines.visible,Sa:t.vertLines.visible,Ta:t.horzLines.color,xa:t.vertLines.color,Ra:t.horzLines.style,Ca:t.vertLines.style,Da:this.Pt.ys().Va(),Pa:(this.Pt.Qt().Et().Va()||[]).map((t=>({ka:t.coord})))};this.Gt.ht(i),this.xt=false;}return this.Gt}}class si{constructor(t){this.sh=new ii(t);}lr(){return this.sh}}const ni={Ia:4,Ba:1e-4};function ei(t,i){const s=100*(t-i)/i;return i<0?-s:s}function ri(t,i){const s=ei(t.$e(),i),n=ei(t.qe(),i);return new mt(s,n)}function hi(t,i){const s=100*(t-i)/i+100;return i<0?-s:s}function ai(t,i){const s=hi(t.$e(),i),n=hi(t.qe(),i);return new mt(s,n)}function li(t,i){const s=Math.abs(t);if(s<1e-15)return 0;const n=Math.log10(s+i.Ba)+i.Ia;return t<0?-n:n}function oi(t,i){const s=Math.abs(t);if(s<1e-15)return 0;const n=Math.pow(10,s-i.Ia)-i.Ba;return t<0?-n:n}function _i(t,i){if(null===t)return null;const s=li(t.$e(),i),n=li(t.qe(),i);return new mt(s,n)}function ui(t,i){if(null===t)return null;const s=oi(t.$e(),i),n=oi(t.qe(),i);return new mt(s,n)}function ci(t){if(null===t)return ni;const i=Math.abs(t.qe()-t.$e());if(i>=1||i<1e-15)return ni;const s=Math.ceil(Math.abs(Math.log10(i))),n=ni.Ia+s;return {Ia:n,Ba:1/Math.pow(10,n)}}class di{constructor(t,i){if(this.Ea=t,this.Aa=i,function(t){if(t<0)return  false;for(let i=t;i>1;i/=10)if(i%10!=0)return  false;return  true}(this.Ea))this.za=[2,2.5,2];else {this.za=[];for(let t=this.Ea;1!==t;){if(t%2==0)this.za.push(2),t/=2;else {if(t%5!=0)throw new Error("unexpected base");this.za.push(2,2.5),t/=5;}if(this.za.length>100)throw new Error("something wrong with base")}}}La(t,i,s){const n=0===this.Ea?0:1/this.Ea;let e=Math.pow(10,Math.max(0,Math.ceil(Math.log10(t-i)))),r=0,h=this.Aa[0];for(;;){const t=Jt(e,n,1e-14)&&e>n+1e-14,i=Jt(e,s*h,1e-14),a=Jt(e,1,1e-14);if(!(t&&i&&a))break;e/=h,h=this.Aa[++r%this.Aa.length];}if(e<=n+1e-14&&(e=n),e=Math.max(1,e),this.za.length>0&&(a=e,l=1,o=1e-14,Math.abs(a-l)<o))for(r=0,h=this.za[0];Jt(e,s*h,1e-14)&&e>n+1e-14;)e/=h,h=this.za[++r%this.za.length];var a,l,o;return e}}class fi{constructor(t,i,s,n){this.Oa=[],this.Yi=t,this.Ea=i,this.Na=s,this.Fa=n;}La(t,i){if(t<i)throw new Error("high < low");const s=this.Yi.$t(),n=(t-i)*this.Wa()/s,e=new di(this.Ea,[2,2.5,2]),r=new di(this.Ea,[2,2,2.5]),h=new di(this.Ea,[2.5,2,2]),a=[];return a.push(e.La(t,i,n),r.La(t,i,n),h.La(t,i,n)),function(t){if(t.length<1)throw Error("array is empty");let i=t[0];for(let s=1;s<t.length;++s)t[s]<i&&(i=t[s]);return i}(a)}Ha(){const t=this.Yi,i=t.zt();if(null===i)return void(this.Oa=[]);const s=t.$t(),n=this.Na(s-1,i),e=this.Na(0,i),r=this.Yi.N().entireTextOnly?this.Ua()/2:0,h=r,a=s-1-r,l=Math.max(n,e),o=Math.min(n,e);if(l===o)return void(this.Oa=[]);const _=this.La(l,o);if(this.$a(i,_,l,o,h,a),t.qa()&&this.Ya(_,o,l)){const t=this.Yi.ja();this.Ka(i,_,h,a,t,2*t);}const u=this.Oa.map((t=>t.Xa)),c=this.Yi.Za(u);for(let t=0;t<this.Oa.length;t++)this.Oa[t].Ga=c[t];}Va(){return this.Oa}Ua(){return this.Yi.P()}Wa(){return Math.ceil(2.5*this.Ua())}$a(t,i,s,n,e,r){const h=this.Oa,a=this.Yi;let l=s%i;l+=l<0?i:0;const o=s>=n?1:-1;let _=null,u=0;for(let c=s-l;c>n;c-=i){const s=this.Fa(c,t,true);null!==_&&Math.abs(s-_)<this.Wa()||(s<e||s>r||(u<h.length?(h[u].ka=s,h[u].Ga=a.Ja(c),h[u].Xa=c):h.push({ka:s,Ga:a.Ja(c),Xa:c}),u++,_=s,a.Qa()&&(i=this.La(c*o,n))));}h.length=u;}Ka(t,i,s,n,e,r){const h=this.Oa,a=this.tl(t,s,e,r),l=this.tl(t,n,-r,-e),o=this.Fa(0,t,true)-this.Fa(i,t,true);h.length>0&&h[0].ka-a.ka<o/2&&h.shift(),h.length>0&&l.ka-h[h.length-1].ka<o/2&&h.pop(),h.unshift(a),h.push(l);}tl(t,i,s,n){const e=(s+n)/2,r=this.Na(i+s,t),h=this.Na(i+n,t),a=Math.min(r,h),l=Math.max(r,h),o=Math.max(.1,this.La(l,a)),_=this.Na(i+e,t),u=_-_%o,c=this.Fa(u,t,true);return {Ga:this.Yi.Ja(u),ka:c,Xa:u}}Ya(t,i,s){let n=c(this.Yi.Qe());return this.Yi.Qa()&&(n=ui(n,this.Yi.il())),n.$e()-i<t&&s-n.qe()<t}}function pi(t){return t.slice().sort(((t,i)=>u(t.hs())-u(i.hs())))}var vi;!function(t){t[t.Normal=0]="Normal",t[t.Logarithmic=1]="Logarithmic",t[t.Percentage=2]="Percentage",t[t.IndexedTo100=3]="IndexedTo100";}(vi||(vi={}));const mi=new st,wi=new it(100,1);class gi{constructor(t,i,s,n,e){this.sl=0,this.nl=null,this.Ge=null,this.el=null,this.rl={hl:false,al:null},this.ll=false,this.ol=0,this._l=0,this.ul=new d,this.cl=new d,this.dl=[],this.fl=null,this.pl=null,this.vl=null,this.ml=null,this.wl=null,this.ha=wi,this.gl=ci(null),this.Ml=t,this.Ps=i,this.bl=s,this.Sl=n,this.xl=e,this.Cl=new fi(this,100,this.Pl.bind(this),this.kl.bind(this));}wa(){return this.Ml}N(){return this.Ps}hr(t){if(f(this.Ps,t),this.ga(),void 0!==t.mode&&this.yl({ie:t.mode}),void 0!==t.scaleMargins){const i=_(t.scaleMargins.top),s=_(t.scaleMargins.bottom);if(i<0||i>1)throw new Error(`Invalid top margin - expect value between 0 and 1, given=${i}`);if(s<0||s>1)throw new Error(`Invalid bottom margin - expect value between 0 and 1, given=${s}`);if(i+s>1)throw new Error(`Invalid margins - sum of margins must be less than 1, given=${i+s}`);this.Tl(),this.vl=null;}}Rl(){return this.Ps.autoScale}Dl(){return this.ll}Qa(){return 1===this.Ps.mode}Le(){return 2===this.Ps.mode}Vl(){return 3===this.Ps.mode}il(){return this.gl}ie(){return {sn:this.Ps.autoScale,Il:this.Ps.invertScale,ie:this.Ps.mode}}yl(t){const i=this.ie();let s=null;void 0!==t.sn&&(this.Ps.autoScale=t.sn),void 0!==t.ie&&(this.Ps.mode=t.ie,2!==t.ie&&3!==t.ie||(this.Ps.autoScale=true),this.rl.hl=false),1===i.ie&&t.ie!==i.ie&&(!function(t,i){if(null===t)return  false;const s=oi(t.$e(),i),n=oi(t.qe(),i);return isFinite(s)&&isFinite(n)}(this.Ge,this.gl)?this.Ps.autoScale=true:(s=ui(this.Ge,this.gl),null!==s&&this.Bl(s))),1===t.ie&&t.ie!==i.ie&&(s=_i(this.Ge,this.gl),null!==s&&this.Bl(s));const n=i.ie!==this.Ps.mode;n&&(2===i.ie||this.Le())&&this.ga(),n&&(3===i.ie||this.Vl())&&this.ga(),void 0!==t.Il&&i.Il!==t.Il&&(this.Ps.invertScale=t.Il,this.El()),this.cl.p(i,this.ie());}Al(){return this.cl}P(){return this.bl.fontSize}$t(){return this.sl}zl(t){this.sl!==t&&(this.sl=t,this.Tl(),this.vl=null);}Ll(){if(this.nl)return this.nl;const t=this.$t()-this.Ol()-this.Nl();return this.nl=t,t}Qe(){return this.Fl(),this.Ge}Bl(t,i){const s=this.Ge;(i||null===s&&null!==t||null!==s&&!s.He(t))&&(this.vl=null,this.Ge=t);}Wl(t){this.Bl(t),this.Hl(null!==t);}Ki(){return this.Fl(),0===this.sl||!this.Ge||this.Ge.Ki()}Ul(t){return this.Il()?t:this.$t()-1-t}Nt(t,i){return this.Le()?t=ei(t,i):this.Vl()&&(t=hi(t,i)),this.kl(t,i)}$l(t,i,s){this.Fl();const n=this.Nl(),e=u(this.Qe()),r=e.$e(),h=e.qe(),a=this.Ll()-1,l=this.Il(),o=a/(h-r),_=void 0===s?0:s.from,c=void 0===s?t.length:s.to,d=this.ql();for(let s=_;s<c;s++){const e=t[s],h=e.gt;if(isNaN(h))continue;let a=h;null!==d&&(a=d(e.gt,i));const _=n+o*(a-r),u=l?_:this.sl-1-_;e.ut=u;}}Yl(t,i,s){this.Fl();const n=this.Nl(),e=u(this.Qe()),r=e.$e(),h=e.qe(),a=this.Ll()-1,l=this.Il(),o=a/(h-r),_=void 0===s?0:s.from,c=void 0===s?t.length:s.to,d=this.ql();for(let s=_;s<c;s++){const e=t[s];let h=e.qh,a=e.Yh,_=e.jh,u=e.Kh;null!==d&&(h=d(e.qh,i),a=d(e.Yh,i),_=d(e.jh,i),u=d(e.Kh,i));let c=n+o*(h-r),f=l?c:this.sl-1-c;e.jl=f,c=n+o*(a-r),f=l?c:this.sl-1-c,e.Kl=f,c=n+o*(_-r),f=l?c:this.sl-1-c,e.Xl=f,c=n+o*(u-r),f=l?c:this.sl-1-c,e.Zl=f;}}Ts(t,i){const s=this.Pl(t,i);return this.Gl(s,i)}Gl(t,i){let s=t;return this.Le()?s=function(t,i){return i<0&&(t=-t),t/100*i+i}(s,i):this.Vl()&&(s=function(t,i){return t-=100,i<0&&(t=-t),t/100*i+i}(s,i)),s}ba(){return this.dl}Dt(){return this.pl||(this.pl=pi(this.dl)),this.pl}Jl(t){ -1===this.dl.indexOf(t)&&(this.dl.push(t),this.ga(),this.Ql());}io(t){const i=this.dl.indexOf(t);if(-1===i)throw new Error("source is not attached to scale");this.dl.splice(i,1),0===this.dl.length&&(this.yl({sn:true}),this.Bl(null)),this.ga(),this.Ql();}zt(){let t=null;for(const i of this.dl){const s=i.zt();null!==s&&((null===t||s.Hh<t.Hh)&&(t=s));}return null===t?null:t.Wt}Il(){return this.Ps.invertScale}Va(){const t=null===this.zt();if(null!==this.vl&&(t||this.vl.so===t))return this.vl.Va;this.Cl.Ha();const i=this.Cl.Va();return this.vl={Va:i,so:t},this.ul.p(),i}no(){return this.ul}eo(t){this.Le()||this.Vl()||null===this.ml&&null===this.el&&(this.Ki()||(this.ml=this.sl-t,this.el=u(this.Qe()).Ue()));}ro(t){if(this.Le()||this.Vl())return;if(null===this.ml)return;this.yl({sn:false}),(t=this.sl-t)<0&&(t=0);let i=(this.ml+.2*(this.sl-1))/(t+.2*(this.sl-1));const s=u(this.el).Ue();i=Math.max(i,.1),s.je(i),this.Bl(s);}ho(){this.Le()||this.Vl()||(this.ml=null,this.el=null);}ao(t){this.Rl()||null===this.wl&&null===this.el&&(this.Ki()||(this.wl=t,this.el=u(this.Qe()).Ue()));}lo(t){if(this.Rl())return;if(null===this.wl)return;const i=u(this.Qe()).Ye()/(this.Ll()-1);let s=t-this.wl;this.Il()&&(s*=-1);const n=s*i,e=u(this.el).Ue();e.Ke(n),this.Bl(e,true),this.vl=null;}oo(){this.Rl()||null!==this.wl&&(this.wl=null,this.el=null);}ra(){return this.ha||this.ga(),this.ha}Zi(t,i){switch(this.Ps.mode){case 2:return this._o(ei(t,i));case 3:return this.ra().format(hi(t,i));default:return this.nr(t)}}Ja(t){switch(this.Ps.mode){case 2:return this._o(t);case 3:return this.ra().format(t);default:return this.nr(t)}}Za(t){switch(this.Ps.mode){case 2:return this.uo(t);case 3:return this.ra().formatTickmarks(t);default:return this.co(t)}}Dh(t){return this.nr(t,u(this.fl).ra())}Vh(t,i){return t=ei(t,i),this._o(t,mi)}do(){return this.dl}fo(t){this.rl={al:t,hl:false};}Ns(){this.dl.forEach((t=>t.Ns()));}qa(){return this.Ps.ensureEdgeTickMarksVisible&&this.Rl()}ja(){return this.P()/2}ga(){this.vl=null;let t=1/0;this.fl=null;for(const i of this.dl)i.hs()<t&&(t=i.hs(),this.fl=i);let i=100;null!==this.fl&&(i=Math.round(1/this.fl.ea())),this.ha=wi,this.Le()?(this.ha=mi,i=100):this.Vl()?(this.ha=new it(100,1),i=100):null!==this.fl&&(this.ha=this.fl.ra()),this.Cl=new fi(this,i,this.Pl.bind(this),this.kl.bind(this)),this.Cl.Ha();}Ql(){this.pl=null;}Xi(){return this.xl}Hl(t){this.ll=t;}Ol(){return this.Il()?this.Ps.scaleMargins.bottom*this.$t()+this._l:this.Ps.scaleMargins.top*this.$t()+this.ol}Nl(){return this.Il()?this.Ps.scaleMargins.top*this.$t()+this.ol:this.Ps.scaleMargins.bottom*this.$t()+this._l}Fl(){this.rl.hl||(this.rl.hl=true,this.po());}Tl(){this.nl=null;}kl(t,i){if(this.Fl(),this.Ki())return 0;t=this.Qa()&&t?li(t,this.gl):t;const s=u(this.Qe()),n=this.Nl()+(this.Ll()-1)*(t-s.$e())/s.Ye();return this.Ul(n)}Pl(t,i){if(this.Fl(),this.Ki())return 0;const s=this.Ul(t),n=u(this.Qe()),e=n.$e()+n.Ye()*((s-this.Nl())/(this.Ll()-1));return this.Qa()?oi(e,this.gl):e}El(){this.vl=null,this.Cl.Ha();}po(){if(this.Dl()&&!this.Rl())return;const t=this.rl.al;if(null===t)return;let i=null;const s=this.do();let n=0,e=0;for(const r of s){if(!r.Vt())continue;const s=r.zt();if(null===s)continue;const h=r.Mh(t.Uh(),t.bi());let a=h&&h.Qe();if(null!==a){switch(this.Ps.mode){case 1:a=_i(a,this.gl);break;case 2:a=ri(a,s.Wt);break;case 3:a=ai(a,s.Wt);}if(i=null===i?a:i.vn(u(a)),null!==h){const t=h.tr();null!==t&&(n=Math.max(n,t.above),e=Math.max(e,t.below));}}}if(this.qa()&&(n=Math.max(n,this.ja()),e=Math.max(e,this.ja())),n===this.ol&&e===this._l||(this.ol=n,this._l=e,this.vl=null,this.Tl()),null!==i){if(i.$e()===i.qe()){const t=this.fl,s=5*(null===t||this.Le()||this.Vl()?1:t.ea());this.Qa()&&(i=ui(i,this.gl)),i=new mt(i.$e()-s,i.qe()+s),this.Qa()&&(i=_i(i,this.gl));}if(this.Qa()){const t=ui(i,this.gl),s=ci(t);if(r=s,h=this.gl,r.Ia!==h.Ia||r.Ba!==h.Ba){const n=null!==this.el?ui(this.el,this.gl):null;this.gl=s,i=_i(t,s),null!==n&&(this.el=_i(n,s));}}this.Bl(i);}else null===this.Ge&&(this.Bl(new mt(-0.5,.5)),this.gl=ci(null));var r,h;}ql(){return this.Le()?ei:this.Vl()?hi:this.Qa()?t=>li(t,this.gl):null}vo(t,i,s){return void 0===i?(void 0===s&&(s=this.ra()),s.format(t)):i(t)}mo(t,i,s){return void 0===i?(void 0===s&&(s=this.ra()),s.formatTickmarks(t)):i(t)}nr(t,i){return this.vo(t,this.Sl.priceFormatter,i)}co(t,i){const s=this.Sl.priceFormatter;return this.mo(t,this.Sl.tickmarksPriceFormatter??(s?t=>t.map(s):void 0),i)}_o(t,i){return this.vo(t,this.Sl.percentageFormatter,i)}uo(t,i){const s=this.Sl.percentageFormatter;return this.mo(t,this.Sl.tickmarksPercentageFormatter??(s?t=>t.map(s):void 0),i)}}function Mi(t){return t instanceof jt}class bi{constructor(t,i){this.dl=[],this.wo=new Map,this.sl=0,this.Mo=0,this.bo=1,this.pl=null,this.So=false,this.xo=new d,this.kh=[],this.uh=t,this.ts=i,this.Co=new si(this);const s=i.N();this.Po=this.ko("left",s.leftPriceScale),this.yo=this.ko("right",s.rightPriceScale),this.Po.Al().i(this.To.bind(this,this.Po),this),this.yo.Al().i(this.To.bind(this,this.yo),this),this.Ro(s);}Ro(t){if(t.leftPriceScale&&this.Po.hr(t.leftPriceScale),t.rightPriceScale&&this.yo.hr(t.rightPriceScale),t.localization&&(this.Po.ga(),this.yo.ga()),t.overlayPriceScales){const i=Array.from(this.wo.values());for(const s of i){const i=u(s[0].Ft());i.hr(t.overlayPriceScales),t.localization&&i.ga();}}}Do(t){switch(t){case "left":return this.Po;case "right":return this.yo}return this.wo.has(t)?_(this.wo.get(t))[0].Ft():null}m(){this.Qt().Vo().u(this),this.Po.Al().u(this),this.yo.Al().u(this),this.dl.forEach((t=>{t.m&&t.m();})),this.kh=this.kh.filter((t=>{const i=t.oh();return i.detached&&i.detached(),false})),this.xo.p();}Io(){return this.bo}Bo(t){this.bo=t;}Qt(){return this.ts}Qi(){return this.Mo}$t(){return this.sl}Eo(t){this.Mo=t,this.Ao();}zl(t){this.sl=t,this.Po.zl(t),this.yo.zl(t),this.dl.forEach((i=>{if(this.Un(i)){const s=i.Ft();null!==s&&s.zl(t);}})),this.Ao();}zo(t){this.So=t;}Lo(){return this.So}Oo(){return this.dl.filter(Mi)}ba(){return this.dl}Un(t){const i=t.Ft();return null===i||this.Po!==i&&this.yo!==i}Jl(t,i,s){this.No(t,i,s?t.hs():this.dl.length);}io(t,i){const s=this.dl.indexOf(t);o(-1!==s,"removeDataSource: invalid data source"),this.dl.splice(s,1),i||this.dl.forEach(((t,i)=>t.ls(i)));const n=u(t.Ft()).wa();if(this.wo.has(n)){const i=_(this.wo.get(n)),s=i.indexOf(t);-1!==s&&(i.splice(s,1),0===i.length&&this.wo.delete(n));}const e=t.Ft();e&&e.ba().indexOf(t)>=0&&(e.io(t),this.Fo(e)),this.pl=null;}qn(t){return t===this.Po?"left":t===this.yo?"right":"overlay"}Wo(){return this.Po}Ho(){return this.yo}Uo(t,i){t.eo(i);}$o(t,i){t.ro(i),this.Ao();}qo(t){t.ho();}Yo(t,i){t.ao(i);}jo(t,i){t.lo(i),this.Ao();}Ko(t){t.oo();}Ao(){this.dl.forEach((t=>{t.Ns();}));}ys(){let t=null;return this.ts.N().rightPriceScale.visible&&0!==this.yo.ba().length?t=this.yo:this.ts.N().leftPriceScale.visible&&0!==this.Po.ba().length?t=this.Po:0!==this.dl.length&&(t=this.dl[0].Ft()),null===t&&(t=this.yo),t}$n(){let t=null;return this.ts.N().rightPriceScale.visible?t=this.yo:this.ts.N().leftPriceScale.visible&&(t=this.Po),t}Fo(t){null!==t&&t.Rl()&&this.Xo(t);}Zo(t){const i=this.uh.Pe();t.yl({sn:true}),null!==i&&t.fo(i),this.Ao();}Go(){this.Xo(this.Po),this.Xo(this.yo);}Jo(){this.Fo(this.Po),this.Fo(this.yo),this.dl.forEach((t=>{this.Un(t)&&this.Fo(t.Ft());})),this.Ao(),this.ts.ar();}Dt(){return null===this.pl&&(this.pl=pi(this.dl)),this.pl}Qo(t,i){i=Gt(i,0,this.dl.length-1);const s=this.dl.indexOf(t);o(-1!==s,"setSeriesOrder: invalid data source"),this.dl.splice(s,1),this.dl.splice(i,0,t),this.dl.forEach(((t,i)=>t.ls(i))),this.pl=null;for(const t of [this.Po,this.yo])t.Ql(),t.ga();this.ts.ar();}It(){return this.Dt().filter(Mi)}t_(){return this.xo}i_(){return this.Co}ua(t){this.kh.push(new At(t));}ca(t){this.kh=this.kh.filter((i=>i.oh()!==t)),t.detached&&t.detached(),this.ts.ar();}s_(){return this.kh}sa(t,i){return this.kh.map((s=>s.jn(t,i))).filter((t=>null!==t))}Xo(t){const i=t.do();if(i&&i.length>0&&!this.uh.Ki()){const i=this.uh.Pe();null!==i&&t.fo(i);}t.Ns();}No(t,i,s){let n=this.Do(i);if(null===n&&(n=this.ko(i,this.ts.N().overlayPriceScales)),this.dl.splice(s,0,t),!Z(i)){const s=this.wo.get(i)||[];s.push(t),this.wo.set(i,s);}t.ls(s),n.Jl(t),t._s(n),this.Fo(n),this.pl=null;}To(t,i,s){i.ie!==s.ie&&this.Xo(t);}ko(t,i){const s={visible:true,autoScale:true,...g(i)},n=new gi(t,s,this.ts.N().layout,this.ts.N().localization,this.ts.Xi());return n.zl(this.$t()),n}}function Si(t){return {n_:t.n_,e_:{Kn:t.r_.externalId},h_:t.r_.cursorStyle}}function xi(t,i,s,n){for(const e of t){const t=e.Tt(n);if(null!==t&&t.jn){const n=t.jn(i,s);if(null!==n)return {a_:e,e_:n}}}return null}function Ci(t){return void 0!==t.Fs}function Pi(t,i,s){const n=[t,...t.Dt()],e=function(t,i,s){let n,e;for(const a of t){const t=a.sa?.(i,s)??[];for(const i of t)r=i.zOrder,h=n?.zOrder,(!h||"top"===r&&"top"!==h||"normal"===r&&"bottom"===h)&&(n=i,e=a);}var r,h;return n&&e?{r_:n,n_:e}:null}(n,i,s);if("top"===e?.r_.zOrder)return Si(e);for(const r of n){if(e&&e.n_===r&&"bottom"!==e.r_.zOrder&&!e.r_.isBackground)return Si(e);if(Ci(r)){const n=xi(r.Fs(t),i,s,t);if(null!==n)return {n_:r,a_:n.a_,e_:n.e_}}if(e&&e.n_===r&&"bottom"!==e.r_.zOrder&&e.r_.isBackground)return Si(e)}return e?.r_?Si(e):null}class ki{constructor(t,i,s=50){this.kn=0,this.yn=1,this.Tn=1,this.Dn=new Map,this.Rn=new Map,this.l_=t,this.o_=i,this.Vn=s;}__(t){const i=t.time,s=this.o_.cacheKey(i),n=this.Dn.get(s);if(void 0!==n)return n.u_;if(this.kn===this.Vn){const t=this.Rn.get(this.Tn);this.Rn.delete(this.Tn),this.Dn.delete(_(t)),this.Tn++,this.kn--;}const e=this.l_(t);return this.Dn.set(s,{u_:e,An:this.yn}),this.Rn.set(this.yn,s),this.kn++,this.yn++,e}}class yi{constructor(t,i){o(t<=i,"right should be >= left"),this.c_=t,this.d_=i;}Uh(){return this.c_}bi(){return this.d_}f_(){return this.d_-this.c_+1}Te(t){return this.c_<=t&&t<=this.d_}He(t){return this.c_===t.Uh()&&this.d_===t.bi()}}function Ti(t,i){return null===t||null===i?t===i:t.He(i)}class Ri{constructor(){this.p_=new Map,this.Dn=null,this.v_=false;}m_(t){this.v_=t,this.Dn=null;}w_(t,i){this.g_(i),this.Dn=null;for(let s=i;s<t.length;++s){const i=t[s];let n=this.p_.get(i.timeWeight);void 0===n&&(n=[],this.p_.set(i.timeWeight,n)),n.push({index:s,time:i.time,weight:i.timeWeight,originalTime:i.originalTime});}}M_(t,i,s,n,e){const r=Math.ceil(i/t);return null!==this.Dn&&this.Dn.b_===r&&e===this.Dn.S_&&s===this.Dn.x_||(this.Dn={S_:e,x_:s,Va:this.C_(r,s,n),b_:r}),this.Dn.Va}g_(t){if(0===t)return void this.p_.clear();const i=[];this.p_.forEach(((s,n)=>{t<=s[0].index?i.push(n):s.splice(kt(s,t,(i=>i.index<t)),1/0);}));for(const t of i)this.p_.delete(t);}C_(t,i,s){let n=[];const e=t=>!i||s.has(t.index);for(const i of Array.from(this.p_.keys()).sort(((t,i)=>i-t))){if(!this.p_.get(i))continue;const s=n;n=[];const r=s.length;let h=0;const a=_(this.p_.get(i)),l=a.length;let o=1/0,u=-1/0;for(let i=0;i<l;i++){const l=a[i],_=l.index;for(;h<r;){const t=s[h],i=t.index;if(!(i<_&&e(t))){o=i;break}h++,n.push(t),u=i,o=1/0;}if(o-_>=t&&_-u>=t&&e(l))n.push(l),u=_;else if(this.v_)return s}for(;h<r;h++)e(s[h])&&n.push(s[h]);}return n}}class Di{constructor(t){this.P_=t;}k_(){return null===this.P_?null:new yi(Math.floor(this.P_.Uh()),Math.ceil(this.P_.bi()))}y_(){return this.P_}static T_(){return new Di(null)}}function Vi(t,i){return t.weight>i.weight?t:i}class Ii{constructor(t,i,s,n){this.Mo=0,this.R_=null,this.D_=[],this.wl=null,this.ml=null,this.V_=new Ri,this.I_=new Map,this.B_=Di.T_(),this.E_=true,this.A_=new d,this.z_=new d,this.L_=new d,this.O_=null,this.N_=null,this.F_=new Map,this.W_=-1,this.H_=[],this.Ps=i,this.Sl=s,this.U_=i.rightOffset,this.q_=i.barSpacing,this.ts=t,this.o_=n,this.Y_(),this.V_.m_(i.uniformDistribution),this.j_();}N(){return this.Ps}K_(t){f(this.Sl,t),this.X_(),this.Y_();}hr(t,i){f(this.Ps,t),this.Ps.fixLeftEdge&&this.Z_(),this.Ps.fixRightEdge&&this.G_(),void 0!==t.barSpacing&&this.ts.dn(t.barSpacing),void 0!==t.rightOffset&&this.ts.fn(t.rightOffset),void 0===t.minBarSpacing&&void 0===t.maxBarSpacing||this.ts.dn(t.barSpacing??this.q_),void 0!==t.ignoreWhitespaceIndices&&t.ignoreWhitespaceIndices!==this.Ps.ignoreWhitespaceIndices&&this.j_(),this.X_(),this.Y_(),this.L_.p();}Rs(t){return this.D_[t]?.time??null}ss(t){return this.D_[t]??null}J_(t,i){if(this.D_.length<1)return null;if(this.o_.key(t)>this.o_.key(this.D_[this.D_.length-1].time))return i?this.D_.length-1:null;const s=kt(this.D_,this.o_.key(t),((t,i)=>this.o_.key(t.time)<i));return this.o_.key(t)<this.o_.key(this.D_[s].time)?i?s:null:s}Ki(){return 0===this.Mo||0===this.D_.length||null===this.R_}Q_(){return this.D_.length>0}Pe(){return this.tu(),this.B_.k_()}iu(){return this.tu(),this.B_.y_()}su(){const t=this.Pe();if(null===t)return null;const i={from:t.Uh(),to:t.bi()};return this.nu(i)}nu(t){const i=Math.round(t.from),s=Math.round(t.to),n=u(this.eu()),e=u(this.ru());return {from:u(this.ss(Math.max(n,i))),to:u(this.ss(Math.min(e,s)))}}hu(t){return {from:u(this.J_(t.from,true)),to:u(this.J_(t.to,true))}}Qi(){return this.Mo}Eo(t){if(!isFinite(t)||t<=0)return;if(this.Mo===t)return;const i=this.iu(),s=this.Mo;if(this.Mo=t,this.E_=true,this.Ps.lockVisibleTimeRangeOnResize&&0!==s){const i=this.q_*t/s;this.q_=i;}if(this.Ps.fixLeftEdge&&null!==i&&i.Uh()<=0){const i=s-t;this.U_-=Math.round(i/this.q_)+1,this.E_=true;}this.au(),this.lu();}qt(t){if(this.Ki()||!v(t))return 0;const i=this.ou()+this.U_-t;return this.Mo-(i+.5)*this.q_-1}_u(t,i){const s=this.ou(),n=void 0===i?0:i.from,e=void 0===i?t.length:i.to;for(let i=n;i<e;i++){const n=t[i].wt,e=s+this.U_-n,r=this.Mo-(e+.5)*this.q_-1;t[i]._t=r;}}uu(t,i){const s=Math.ceil(this.cu(t));return i&&this.Ps.ignoreWhitespaceIndices&&!this.du(s)?this.fu(s):s}fn(t){this.E_=true,this.U_=t,this.lu(),this.ts.pu(),this.ts.ar();}vu(){return this.q_}dn(t){this.mu(t),this.lu(),this.ts.pu(),this.ts.ar();}wu(){return this.U_}Va(){if(this.Ki())return null;if(null!==this.N_)return this.N_;const t=this.q_,i=5*(this.ts.N().layout.fontSize+4)/8*(this.Ps.tickMarkMaxCharacterLength||8),s=Math.round(i/t),n=u(this.Pe()),e=Math.max(n.Uh(),n.Uh()-s),r=Math.max(n.bi(),n.bi()-s),h=this.V_.M_(t,i,this.Ps.ignoreWhitespaceIndices,this.F_,this.W_),a=this.eu()+s,l=this.ru()-s,o=this.gu(),_=this.Ps.fixLeftEdge||o,c=this.Ps.fixRightEdge||o;let d=0;for(const t of h){if(!(e<=t.index&&t.index<=r))continue;let s;d<this.H_.length?(s=this.H_[d],s.coord=this.qt(t.index),s.label=this.Mu(t),s.weight=t.weight):(s={needAlignCoordinate:false,coord:this.qt(t.index),label:this.Mu(t),weight:t.weight},this.H_.push(s)),this.q_>i/2&&!o?s.needAlignCoordinate=false:s.needAlignCoordinate=_&&t.index<=a||c&&t.index>=l,d++;}return this.H_.length=d,this.N_=this.H_,this.H_}bu(){this.E_=true,this.dn(this.Ps.barSpacing),this.fn(this.Ps.rightOffset);}Su(t){this.E_=true,this.R_=t,this.lu(),this.Z_();}xu(t,i){const s=this.cu(t),n=this.vu(),e=n+i*(n/10);this.dn(e),this.Ps.rightBarStaysOnScroll||this.fn(this.wu()+(s-this.cu(t)));}eo(t){this.wl&&this.oo(),null===this.ml&&null===this.O_&&(this.Ki()||(this.ml=t,this.Cu()));}ro(t){if(null===this.O_)return;const i=Gt(this.Mo-t,0,this.Mo),s=Gt(this.Mo-u(this.ml),0,this.Mo);0!==i&&0!==s&&this.dn(this.O_.vu*i/s);}ho(){null!==this.ml&&(this.ml=null,this.Pu());}ao(t){null===this.wl&&null===this.O_&&(this.Ki()||(this.wl=t,this.Cu()));}lo(t){if(null===this.wl)return;const i=(this.wl-t)/this.vu();this.U_=u(this.O_).wu+i,this.E_=true,this.lu();}oo(){null!==this.wl&&(this.wl=null,this.Pu());}ku(){this.yu(this.Ps.rightOffset);}yu(t,i=400){if(!isFinite(t))throw new RangeError("offset is required and must be finite number");if(!isFinite(i)||i<=0)throw new RangeError("animationDuration (optional) must be finite positive number");const s=this.U_,n=performance.now();this.ts._n({Tu:t=>(t-n)/i>=1,Ru:e=>{const r=(e-n)/i;return r>=1?t:s+(t-s)*r}});}kt(t,i){this.E_=true,this.D_=t,this.V_.w_(t,i),this.lu();}Du(){return this.A_}Vu(){return this.z_}Iu(){return this.L_}ou(){return this.R_||0}Bu(t){const i=t.f_();this.mu(this.Mo/i),this.U_=t.bi()-this.ou(),this.lu(),this.E_=true,this.ts.pu(),this.ts.ar();}Eu(){const t=this.eu(),i=this.ru();null!==t&&null!==i&&this.Bu(new yi(t,i+this.Ps.rightOffset));}Au(t){const i=new yi(t.from,t.to);this.Bu(i);}ns(t){return void 0!==this.Sl.timeFormatter?this.Sl.timeFormatter(t.originalTime):this.o_.formatHorzItem(t.time)}j_(){if(!this.Ps.ignoreWhitespaceIndices)return;this.F_.clear();const t=this.ts.js();for(const i of t)for(const t of i.ma())this.F_.set(t,true);this.W_++;}gu(){const t=this.ts.N().handleScroll,i=this.ts.N().handleScale;return !(t.horzTouchDrag||t.mouseWheel||t.pressedMouseMove||t.vertTouchDrag||i.axisDoubleClickReset.time||i.axisPressedMouseMove.time||i.mouseWheel||i.pinch)}eu(){return 0===this.D_.length?null:0}ru(){return 0===this.D_.length?null:this.D_.length-1}zu(t){return (this.Mo-1-t)/this.q_}cu(t){const i=this.zu(t),s=this.ou()+this.U_-i;return Math.round(1e6*s)/1e6}mu(t){const i=this.q_;this.q_=t,this.au(),i!==this.q_&&(this.E_=true,this.Lu());}tu(){if(!this.E_)return;if(this.E_=false,this.Ki())return void this.Ou(Di.T_());const t=this.ou(),i=this.Mo/this.q_,s=this.U_+t,n=new yi(s-i+1,s);this.Ou(new Di(n));}au(){const t=Gt(this.q_,this.Nu(),this.Fu());this.q_!==t&&(this.q_=t,this.E_=true);}Fu(){return this.Ps.maxBarSpacing>0?this.Ps.maxBarSpacing:.5*this.Mo}Nu(){return this.Ps.fixLeftEdge&&this.Ps.fixRightEdge&&0!==this.D_.length?this.Mo/this.D_.length:this.Ps.minBarSpacing}lu(){const t=this.Wu();null!==t&&this.U_<t&&(this.U_=t,this.E_=true);const i=this.Hu();this.U_>i&&(this.U_=i,this.E_=true);}Wu(){const t=this.eu(),i=this.R_;if(null===t||null===i)return null;return t-i-1+(this.Ps.fixLeftEdge?this.Mo/this.q_:Math.min(2,this.D_.length))}Hu(){return this.Ps.fixRightEdge?0:this.Mo/this.q_-Math.min(2,this.D_.length)}Cu(){this.O_={vu:this.vu(),wu:this.wu()};}Pu(){this.O_=null;}Mu(t){let i=this.I_.get(t.weight);return void 0===i&&(i=new ki((t=>this.Uu(t)),this.o_),this.I_.set(t.weight,i)),i.__(t)}Uu(t){return this.o_.formatTickmark(t,this.Sl)}Ou(t){const i=this.B_;this.B_=t,Ti(i.k_(),this.B_.k_())||this.A_.p(),Ti(i.y_(),this.B_.y_())||this.z_.p(),this.Lu();}Lu(){this.N_=null;}X_(){this.Lu(),this.I_.clear();}Y_(){this.o_.updateFormatter(this.Sl);}Z_(){if(!this.Ps.fixLeftEdge)return;const t=this.eu();if(null===t)return;const i=this.Pe();if(null===i)return;const s=i.Uh()-t;if(s<0){const t=this.U_-s-1;this.fn(t);}this.au();}G_(){this.lu(),this.au();}du(t){return !this.Ps.ignoreWhitespaceIndices||(this.F_.get(t)||false)}fu(t){const i=function*(t){const i=Math.round(t),s=i<t;let n=1;for(;;)s?(yield i+n,yield i-n):(yield i-n,yield i+n),n++;}(t),s=this.ru();for(;s;){const t=i.next().value;if(this.F_.get(t))return t;if(t<0||t>s)break}return t}}var Bi,Ei,Ai,zi,Li;!function(t){t[t.OnTouchEnd=0]="OnTouchEnd",t[t.OnNextTap=1]="OnNextTap";}(Bi||(Bi={}));class Oi{constructor(t,i,s){this.$u=[],this.qu=[],this.Mo=0,this.Yu=null,this.ju=new d,this.Ku=new d,this.Xu=null,this.Zu=t,this.Ps=i,this.o_=s,this.xl=new y(this.Ps.layout.colorParsers),this.Gu=new C(this),this.uh=new Ii(this,i.timeScale,this.Ps.localization,s),this.Ct=new X(this,i.crosshair),this.Ju=new Zt(i.crosshair),i.addDefaultPane&&(this.Qu(0),this.$u[0].Bo(2)),this.tc=this.sc(0),this.nc=this.sc(1);}Bh(){this.ec(G.gn());}ar(){this.ec(G.wn());}Zh(){this.ec(new G(1));}Eh(t){const i=this.rc(t);this.ec(i);}hc(){return this.Yu}ac(t){if(this.Yu?.n_===t?.n_&&this.Yu?.e_?.Kn===t?.e_?.Kn)return;const i=this.Yu;this.Yu=t,null!==i&&this.Eh(i.n_),null!==t&&t.n_!==i?.n_&&this.Eh(t.n_);}N(){return this.Ps}hr(t){f(this.Ps,t),this.$u.forEach((i=>i.Ro(t))),void 0!==t.timeScale&&this.uh.hr(t.timeScale),void 0!==t.localization&&this.uh.K_(t.localization),(t.leftPriceScale||t.rightPriceScale)&&this.ju.p(),this.tc=this.sc(0),this.nc=this.sc(1),this.Bh();}lc(t,i,s=0){const n=this.$u[s];if(void 0===n)return;if("left"===t)return f(this.Ps,{leftPriceScale:i}),n.Ro({leftPriceScale:i}),this.ju.p(),void this.Bh();if("right"===t)return f(this.Ps,{rightPriceScale:i}),n.Ro({rightPriceScale:i}),this.ju.p(),void this.Bh();const e=this.oc(t,s);null!==e&&(e.Ft.hr(i),this.ju.p());}oc(t,i){const s=this.$u[i];if(void 0===s)return null;const n=s.Do(t);return null!==n?{Us:s,Ft:n}:null}Et(){return this.uh}$s(){return this.$u}_c(){return this.Ct}uc(){return this.Ku}cc(t,i){t.zl(i),this.pu();}Eo(t){this.Mo=t,this.uh.Eo(this.Mo),this.$u.forEach((i=>i.Eo(t))),this.pu();}dc(t){1!==this.$u.length&&(o(t>=0&&t<this.$u.length,"Invalid pane index"),this.$u.splice(t,1),this.Bh());}fc(t,i){if(this.$u.length<2)return;o(t>=0&&t<this.$u.length,"Invalid pane index");const s=this.$u[t],n=this.$u.reduce(((t,i)=>t+i.Io()),0),e=this.$u.reduce(((t,i)=>t+i.$t()),0),r=e-30*(this.$u.length-1);i=Math.min(r,Math.max(30,i));const h=n/e,a=s.$t();s.Bo(i*h);let l=i-a,_=this.$u.length-1;for(const t of this.$u)if(t!==s){const i=Math.min(r,Math.max(30,t.$t()-l/_));l-=t.$t()-i,_-=1;const s=i*h;t.Bo(s);}this.Bh();}vc(t,i){o(t>=0&&t<this.$u.length&&i>=0&&i<this.$u.length,"Invalid pane index");const s=this.$u[t],n=this.$u[i];this.$u[t]=n,this.$u[i]=s,this.Bh();}mc(t,i){if(o(t>=0&&t<this.$u.length&&i>=0&&i<this.$u.length,"Invalid pane index"),t===i)return;const[s]=this.$u.splice(t,1);this.$u.splice(i,0,s),this.Bh();}Uo(t,i,s){t.Uo(i,s);}$o(t,i,s){t.$o(i,s),this.Ah(),this.ec(this.wc(t,2));}qo(t,i){t.qo(i),this.ec(this.wc(t,2));}Yo(t,i,s){i.Rl()||t.Yo(i,s);}jo(t,i,s){i.Rl()||(t.jo(i,s),this.Ah(),this.ec(this.wc(t,2)));}Ko(t,i){i.Rl()||(t.Ko(i),this.ec(this.wc(t,2)));}Zo(t,i){t.Zo(i),this.ec(this.wc(t,2));}gc(t){this.uh.eo(t);}Mc(t,i){const s=this.Et();if(s.Ki()||0===i)return;const n=s.Qi();t=Math.max(1,Math.min(t,n)),s.xu(t,i),this.pu();}bc(t){this.Sc(0),this.xc(t),this.Cc();}Pc(t){this.uh.ro(t),this.pu();}kc(){this.uh.ho(),this.ar();}Sc(t){this.uh.ao(t);}xc(t){this.uh.lo(t),this.pu();}Cc(){this.uh.oo(),this.ar();}js(){return this.qu}yc(t,i,s,n,e){this.Ct.Vs(t,i);let r=NaN,h=this.uh.uu(t,true);const a=this.uh.Pe();null!==a&&(h=Math.min(Math.max(a.Uh(),h),a.bi()));const l=n.ys(),o=l.zt();if(null!==o&&(r=l.Ts(i,o)),r=this.Ju.Ma(r,h,n),this.Ct.As(h,r,n),this.Zh(),!e){const e=Pi(n,t,i);this.ac(e&&{n_:e.n_,e_:e.e_,h_:e.h_||null}),this.Ku.p(this.Ct.Bt(),{x:t,y:i},s);}}Tc(t,i,s){const n=s.ys(),e=n.zt(),r=n.Nt(t,u(e)),h=this.uh.J_(i,true),a=this.uh.qt(u(h));this.yc(a,r,null,s,true);}Rc(t){this._c().Ls(),this.Zh(),t||this.Ku.p(null,null,null);}Ah(){const t=this.Ct.Us();if(null!==t){const i=this.Ct.Bs(),s=this.Ct.Es();this.yc(i,s,null,t);}this.Ct.Ns();}Dc(t,i,s){const n=this.uh.Rs(0);void 0!==i&&void 0!==s&&this.uh.kt(i,s);const e=this.uh.Rs(0),r=this.uh.ou(),h=this.uh.Pe();if(null!==h&&null!==n&&null!==e){const i=h.Te(r),a=this.o_.key(n)>this.o_.key(e),l=null!==t&&t>r&&!a,o=this.uh.N().allowShiftVisibleRangeOnWhitespaceReplacement,_=i&&(!(void 0===s)||o)&&this.uh.N().shiftVisibleRangeOnNewBar;if(l&&!_){const i=t-r;this.uh.fn(this.uh.wu()-i);}}this.uh.Su(t);}Lh(t){null!==t&&t.Jo();}Hn(t){if(function(t){return t instanceof bi}(t))return t;const i=this.$u.find((i=>i.Dt().includes(t)));return void 0===i?null:i}pu(){this.$u.forEach((t=>t.Jo())),this.Ah();}m(){this.$u.forEach((t=>t.m())),this.$u.length=0,this.Ps.localization.priceFormatter=void 0,this.Ps.localization.percentageFormatter=void 0,this.Ps.localization.timeFormatter=void 0;}Vc(){return this.Gu}Yn(){return this.Gu.N()}Vo(){return this.ju}Ic(t,i){const s=this.Qu(i);this.Bc(t,s),this.qu.push(t),1===this.qu.length?this.Bh():this.ar();}Ec(t){const i=this.Hn(t),s=this.qu.indexOf(t);o(-1!==s,"Series not found");const n=u(i);this.qu.splice(s,1),n.io(t),t.m&&t.m(),this.uh.j_(),this.Ac(n);}Ih(t,i){const s=u(this.Hn(t));s.io(t,true),s.Jl(t,i,true);}Eu(){const t=G.wn();t.rn(),this.ec(t);}zc(t){const i=G.wn();i.ln(t),this.ec(i);}cn(){const t=G.wn();t.cn(),this.ec(t);}dn(t){const i=G.wn();i.dn(t),this.ec(i);}fn(t){const i=G.wn();i.fn(t),this.ec(i);}_n(t){const i=G.wn();i._n(t),this.ec(i);}hn(){const t=G.wn();t.hn(),this.ec(t);}Lc(){return this.Ps.rightPriceScale.visible?"right":"left"}Oc(t,i){o(i>=0,"Index should be greater or equal to 0");if(i===this.Nc(t))return;const s=u(this.Hn(t));s.io(t);const n=this.Qu(i);this.Bc(t,n),0===s.ba().length&&this.Ac(s),this.Bh();}Fc(){return this.nc}$(){return this.tc}Ut(t){const i=this.nc,s=this.tc;if(i===s)return i;if(t=Math.max(0,Math.min(100,Math.round(100*t))),null===this.Xu||this.Xu.mr!==s||this.Xu.wr!==i)this.Xu={mr:s,wr:i,Wc:new Map};else {const i=this.Xu.Wc.get(t);if(void 0!==i)return i}const n=this.xl.tt(s,i,t/100);return this.Xu.Wc.set(t,n),n}Hc(t){return this.$u.indexOf(t)}Xi(){return this.xl}Uc(){return this.$c()}$c(t){const i=new bi(this.uh,this);this.$u.push(i);const s=t??this.$u.length-1,n=G.gn();return n.Qs(s,{tn:0,sn:true}),this.ec(n),i}Qu(t){return o(t>=0,"Index should be greater or equal to 0"),(t=Math.min(this.$u.length,t))<this.$u.length?this.$u[t]:this.$c(t)}Nc(t){return this.$u.findIndex((i=>i.Oo().includes(t)))}wc(t,i){const s=new G(i);if(null!==t){const n=this.$u.indexOf(t);s.Qs(n,{tn:i});}return s}rc(t,i){return void 0===i&&(i=2),this.wc(this.Hn(t),i)}ec(t){this.Zu&&this.Zu(t),this.$u.forEach((t=>t.i_().lr().kt()));}Bc(t,i){const s=t.N().priceScaleId,n=void 0!==s?s:this.Lc();i.Jl(t,n),Z(n)||t.hr(t.N());}sc(t){const i=this.Ps.layout;return "gradient"===i.background.type?0===t?i.background.topColor:i.background.bottomColor:i.background.color}Ac(t){!t.Lo()&&0===t.ba().length&&this.$u.length>1&&this.$u.splice(this.Hc(t),1);}}function Ni(t){return !p(t)&&!m(t)}function Fi(t){return p(t)}!function(t){t[t.Disabled=0]="Disabled",t[t.Continuous=1]="Continuous",t[t.OnDataUpdate=2]="OnDataUpdate";}(Ei||(Ei={})),function(t){t[t.LastBar=0]="LastBar",t[t.LastVisible=1]="LastVisible";}(Ai||(Ai={})),function(t){t.Solid="solid",t.VerticalGradient="gradient";}(zi||(zi={})),function(t){t[t.Year=0]="Year",t[t.Month=1]="Month",t[t.DayOfMonth=2]="DayOfMonth",t[t.Time=3]="Time",t[t.TimeWithSeconds=4]="TimeWithSeconds";}(Li||(Li={}));const Wi=t=>t.getUTCFullYear();function Hi(t,i,s){return i.replace(/yyyy/g,(t=>tt(Wi(t),4))(t)).replace(/yy/g,(t=>tt(Wi(t)%100,2))(t)).replace(/MMMM/g,((t,i)=>new Date(t.getUTCFullYear(),t.getUTCMonth(),1).toLocaleString(i,{month:"long"}))(t,s)).replace(/MMM/g,((t,i)=>new Date(t.getUTCFullYear(),t.getUTCMonth(),1).toLocaleString(i,{month:"short"}))(t,s)).replace(/MM/g,(t=>tt((t=>t.getUTCMonth()+1)(t),2))(t)).replace(/dd/g,(t=>tt((t=>t.getUTCDate())(t),2))(t))}class Ui{constructor(t="yyyy-MM-dd",i="default"){this.qc=t,this.Yc=i;}__(t){return Hi(t,this.qc,this.Yc)}}class $i{constructor(t){this.jc=t||"%h:%m:%s";}__(t){return this.jc.replace("%h",tt(t.getUTCHours(),2)).replace("%m",tt(t.getUTCMinutes(),2)).replace("%s",tt(t.getUTCSeconds(),2))}}const qi={Kc:"yyyy-MM-dd",Xc:"%h:%m:%s",Zc:" ",Gc:"default"};class Yi{constructor(t={}){const i={...qi,...t};this.Jc=new Ui(i.Kc,i.Gc),this.Qc=new $i(i.Xc),this.td=i.Zc;}__(t){return `${this.Jc.__(t)}${this.td}${this.Qc.__(t)}`}}function ji(t){return 60*t*60*1e3}function Ki(t){return 60*t*1e3}const Xi=[{sd:(Zi=1,1e3*Zi),nd:10},{sd:Ki(1),nd:20},{sd:Ki(5),nd:21},{sd:Ki(30),nd:22},{sd:ji(1),nd:30},{sd:ji(3),nd:31},{sd:ji(6),nd:32},{sd:ji(12),nd:33}];var Zi;function Gi(t,i){if(t.getUTCFullYear()!==i.getUTCFullYear())return 70;if(t.getUTCMonth()!==i.getUTCMonth())return 60;if(t.getUTCDate()!==i.getUTCDate())return 50;for(let s=Xi.length-1;s>=0;--s)if(Math.floor(i.getTime()/Xi[s].sd)!==Math.floor(t.getTime()/Xi[s].sd))return Xi[s].nd;return 0}function Ji(t){let i=t;if(m(t)&&(i=ts(t)),!Ni(i))throw new Error("time must be of type BusinessDay");const s=new Date(Date.UTC(i.year,i.month-1,i.day,0,0,0,0));return {ed:Math.round(s.getTime()/1e3),rd:i}}function Qi(t){if(!Fi(t))throw new Error("time must be of type isUTCTimestamp");return {ed:t}}function ts(t){const i=new Date(t);if(isNaN(i.getTime()))throw new Error(`Invalid date string=${t}, expected format=yyyy-mm-dd`);return {day:i.getUTCDate(),month:i.getUTCMonth()+1,year:i.getUTCFullYear()}}function is(t){m(t.time)&&(t.time=ts(t.time));}class ss{options(){return this.Ps}setOptions(t){this.Ps=t,this.updateFormatter(t.localization);}preprocessData(t){Array.isArray(t)?function(t){t.forEach(is);}(t):is(t);}createConverterToInternalObj(t){return u(function(t){return 0===t.length?null:Ni(t[0].time)||m(t[0].time)?Ji:Qi}(t))}key(t){return "object"==typeof t&&"ed"in t?t.ed:this.key(this.convertHorzItemToInternal(t))}cacheKey(t){const i=t;return void 0===i.rd?new Date(1e3*i.ed).getTime():new Date(Date.UTC(i.rd.year,i.rd.month-1,i.rd.day)).getTime()}convertHorzItemToInternal(t){return Fi(i=t)?Qi(i):Ni(i)?Ji(i):Ji(ts(i));var i;}updateFormatter(t){if(!this.Ps)return;const i=t.dateFormat;this.Ps.timeScale.timeVisible?this.hd=new Yi({Kc:i,Xc:this.Ps.timeScale.secondsVisible?"%h:%m:%s":"%h:%m",Zc:"   ",Gc:t.locale}):this.hd=new Ui(i,t.locale);}formatHorzItem(t){const i=t;return this.hd.__(new Date(1e3*i.ed))}formatTickmark(t,i){const s=function(t,i,s){switch(t){case 0:case 10:return i?s?4:3:2;case 20:case 21:case 22:case 30:case 31:case 32:case 33:return i?3:2;case 50:return 2;case 60:return 1;case 70:return 0}}(t.weight,this.Ps.timeScale.timeVisible,this.Ps.timeScale.secondsVisible),n=this.Ps.timeScale;if(void 0!==n.tickMarkFormatter){const e=n.tickMarkFormatter(t.originalTime,s,i.locale);if(null!==e)return e}return function(t,i,s){const n={};switch(i){case 0:n.year="numeric";break;case 1:n.month="short";break;case 2:n.day="numeric";break;case 3:n.hour12=false,n.hour="2-digit",n.minute="2-digit";break;case 4:n.hour12=false,n.hour="2-digit",n.minute="2-digit",n.second="2-digit";}const e=void 0===t.rd?new Date(1e3*t.ed):new Date(Date.UTC(t.rd.year,t.rd.month-1,t.rd.day));return new Date(e.getUTCFullYear(),e.getUTCMonth(),e.getUTCDate(),e.getUTCHours(),e.getUTCMinutes(),e.getUTCSeconds(),e.getUTCMilliseconds()).toLocaleString(s,n)}(t.time,s,i.locale)}maxTickMarkWeight(t){let i=t.reduce(Vi,t[0]).weight;return i>30&&i<50&&(i=30),i}fillWeightsForPoints(t,i){!function(t,i=0){if(0===t.length)return;let s=0===i?null:t[i-1].time.ed,n=null!==s?new Date(1e3*s):null,e=0;for(let r=i;r<t.length;++r){const i=t[r],h=new Date(1e3*i.time.ed);null!==n&&(i.timeWeight=Gi(h,n)),e+=i.time.ed-(s||i.time.ed),s=i.time.ed,n=h;}if(0===i&&t.length>1){const i=Math.ceil(e/(t.length-1)),s=new Date(1e3*(t[0].time.ed-i));t[0].timeWeight=Gi(new Date(1e3*t[0].time.ed),s);}}(t,i);}static ad(t){return f({localization:{dateFormat:"dd MMM 'yy"}},t??{})}}const ns="undefined"!=typeof window;function es(){return !!ns&&window.navigator.userAgent.toLowerCase().indexOf("firefox")>-1}function rs(){return !!ns&&/iPhone|iPad|iPod/.test(window.navigator.platform)}function hs(t){return t+t%2}function as(t){ns&&void 0!==window.chrome&&t.addEventListener("mousedown",(t=>{if(1===t.button)return t.preventDefault(),false}));}class ls{constructor(t,i,s){this.ld=0,this.od=null,this._d={_t:Number.NEGATIVE_INFINITY,ut:Number.POSITIVE_INFINITY},this.ud=0,this.dd=null,this.fd={_t:Number.NEGATIVE_INFINITY,ut:Number.POSITIVE_INFINITY},this.pd=null,this.vd=false,this.md=null,this.wd=null,this.gd=false,this.Md=false,this.bd=false,this.Sd=null,this.xd=null,this.Cd=null,this.Pd=null,this.kd=null,this.yd=null,this.Td=null,this.Rd=0,this.Dd=false,this.Vd=false,this.Id=false,this.Bd=0,this.Ed=null,this.Ad=!rs(),this.zd=t=>{this.Ld(t);},this.Od=t=>{if(this.Nd(t)){const i=this.Fd(t);if(++this.ud,this.dd&&this.ud>1){const{Wd:s}=this.Hd(us(t),this.fd);s<30&&!this.bd&&this.Ud(i,this.qd.$d),this.Yd();}}else {const i=this.Fd(t);if(++this.ld,this.od&&this.ld>1){const{Wd:s}=this.Hd(us(t),this._d);s<5&&!this.Md&&this.jd(i,this.qd.Kd),this.Xd();}}},this.Zd=t,this.qd=i,this.Ps=s,this.Gd();}m(){null!==this.Sd&&(this.Sd(),this.Sd=null),null!==this.xd&&(this.xd(),this.xd=null),null!==this.Pd&&(this.Pd(),this.Pd=null),null!==this.kd&&(this.kd(),this.kd=null),null!==this.yd&&(this.yd(),this.yd=null),null!==this.Cd&&(this.Cd(),this.Cd=null),this.Jd(),this.Xd();}Qd(t){this.Pd&&this.Pd();const i=this.tf.bind(this);if(this.Pd=()=>{this.Zd.removeEventListener("mousemove",i);},this.Zd.addEventListener("mousemove",i),this.Nd(t))return;const s=this.Fd(t);this.jd(s,this.qd.if),this.Ad=true;}Xd(){null!==this.od&&clearTimeout(this.od),this.ld=0,this.od=null,this._d={_t:Number.NEGATIVE_INFINITY,ut:Number.POSITIVE_INFINITY};}Yd(){null!==this.dd&&clearTimeout(this.dd),this.ud=0,this.dd=null,this.fd={_t:Number.NEGATIVE_INFINITY,ut:Number.POSITIVE_INFINITY};}tf(t){if(this.Id||null!==this.wd)return;if(this.Nd(t))return;const i=this.Fd(t);this.jd(i,this.qd.sf),this.Ad=true;}nf(t){const i=ds(t.changedTouches,u(this.Ed));if(null===i)return;if(this.Bd=cs(t),null!==this.Td)return;if(this.Vd)return;this.Dd=true;const s=this.Hd(us(i),u(this.wd)),{ef:n,rf:e,Wd:r}=s;if(this.gd||!(r<5)){if(!this.gd){const t=.5*n,i=e>=t&&!this.Ps.hf(),s=t>e&&!this.Ps.af();i||s||(this.Vd=true),this.gd=true,this.bd=true,this.Jd(),this.Yd();}if(!this.Vd){const s=this.Fd(t,i);this.Ud(s,this.qd.lf),_s(t);}}}_f(t){if(0!==t.button)return;const i=this.Hd(us(t),u(this.md)),{Wd:s}=i;if(s>=5&&(this.Md=true,this.Xd()),this.Md){const i=this.Fd(t);this.jd(i,this.qd.uf);}}Hd(t,i){const s=Math.abs(i._t-t._t),n=Math.abs(i.ut-t.ut);return {ef:s,rf:n,Wd:s+n}}cf(t){let i=ds(t.changedTouches,u(this.Ed));if(null===i&&0===t.touches.length&&(i=t.changedTouches[0]),null===i)return;this.Ed=null,this.Bd=cs(t),this.Jd(),this.wd=null,this.yd&&(this.yd(),this.yd=null);const s=this.Fd(t,i);if(this.Ud(s,this.qd.df),++this.ud,this.dd&&this.ud>1){const{Wd:t}=this.Hd(us(i),this.fd);t<30&&!this.bd&&this.Ud(s,this.qd.$d),this.Yd();}else this.bd||(this.Ud(s,this.qd.ff),this.qd.ff&&_s(t));0===this.ud&&_s(t),0===t.touches.length&&this.vd&&(this.vd=false,_s(t));}Ld(t){if(0!==t.button)return;const i=this.Fd(t);if(this.md=null,this.Id=false,this.kd&&(this.kd(),this.kd=null),es()){this.Zd.ownerDocument.documentElement.removeEventListener("mouseleave",this.zd);}if(!this.Nd(t))if(this.jd(i,this.qd.pf),++this.ld,this.od&&this.ld>1){const{Wd:s}=this.Hd(us(t),this._d);s<5&&!this.Md&&this.jd(i,this.qd.Kd),this.Xd();}else this.Md||this.jd(i,this.qd.vf);}Jd(){null!==this.pd&&(clearTimeout(this.pd),this.pd=null);}mf(t){if(null!==this.Ed)return;const i=t.changedTouches[0];this.Ed=i.identifier,this.Bd=cs(t);const s=this.Zd.ownerDocument.documentElement;this.bd=false,this.gd=false,this.Vd=false,this.wd=us(i),this.yd&&(this.yd(),this.yd=null);{const i=this.nf.bind(this),n=this.cf.bind(this);this.yd=()=>{s.removeEventListener("touchmove",i),s.removeEventListener("touchend",n);},s.addEventListener("touchmove",i,{passive:false}),s.addEventListener("touchend",n,{passive:false}),this.Jd(),this.pd=setTimeout(this.wf.bind(this,t),240);}const n=this.Fd(t,i);this.Ud(n,this.qd.gf),this.dd||(this.ud=0,this.dd=setTimeout(this.Yd.bind(this),500),this.fd=us(i));}Mf(t){if(0!==t.button)return;const i=this.Zd.ownerDocument.documentElement;es()&&i.addEventListener("mouseleave",this.zd),this.Md=false,this.md=us(t),this.kd&&(this.kd(),this.kd=null);{const t=this._f.bind(this),s=this.Ld.bind(this);this.kd=()=>{i.removeEventListener("mousemove",t),i.removeEventListener("mouseup",s);},i.addEventListener("mousemove",t),i.addEventListener("mouseup",s);}if(this.Id=true,this.Nd(t))return;const s=this.Fd(t);this.jd(s,this.qd.bf),this.od||(this.ld=0,this.od=setTimeout(this.Xd.bind(this),500),this._d=us(t));}Gd(){this.Zd.addEventListener("mouseenter",this.Qd.bind(this)),this.Zd.addEventListener("touchcancel",this.Jd.bind(this));{const t=this.Zd.ownerDocument,i=t=>{this.qd.Sf&&(t.composed&&this.Zd.contains(t.composedPath()[0])||t.target&&this.Zd.contains(t.target)||this.qd.Sf());};this.xd=()=>{t.removeEventListener("touchstart",i);},this.Sd=()=>{t.removeEventListener("mousedown",i);},t.addEventListener("mousedown",i),t.addEventListener("touchstart",i,{passive:true});}rs()&&(this.Cd=()=>{this.Zd.removeEventListener("dblclick",this.Od);},this.Zd.addEventListener("dblclick",this.Od)),this.Zd.addEventListener("mouseleave",this.xf.bind(this)),this.Zd.addEventListener("touchstart",this.mf.bind(this),{passive:true}),as(this.Zd),this.Zd.addEventListener("mousedown",this.Mf.bind(this)),this.Cf(),this.Zd.addEventListener("touchmove",(()=>{}),{passive:false});}Cf(){ void 0===this.qd.Pf&&void 0===this.qd.kf&&void 0===this.qd.yf||(this.Zd.addEventListener("touchstart",(t=>this.Tf(t.touches)),{passive:true}),this.Zd.addEventListener("touchmove",(t=>{if(2===t.touches.length&&null!==this.Td&&void 0!==this.qd.kf){const i=os(t.touches[0],t.touches[1])/this.Rd;this.qd.kf(this.Td,i),_s(t);}}),{passive:false}),this.Zd.addEventListener("touchend",(t=>{this.Tf(t.touches);})));}Tf(t){1===t.length&&(this.Dd=false),2!==t.length||this.Dd||this.vd?this.Rf():this.Df(t);}Df(t){const i=this.Zd.getBoundingClientRect()||{left:0,top:0};this.Td={_t:(t[0].clientX-i.left+(t[1].clientX-i.left))/2,ut:(t[0].clientY-i.top+(t[1].clientY-i.top))/2},this.Rd=os(t[0],t[1]),void 0!==this.qd.Pf&&this.qd.Pf(),this.Jd();}Rf(){null!==this.Td&&(this.Td=null,void 0!==this.qd.yf&&this.qd.yf());}xf(t){if(this.Pd&&this.Pd(),this.Nd(t))return;if(!this.Ad)return;const i=this.Fd(t);this.jd(i,this.qd.Vf),this.Ad=!rs();}wf(t){const i=ds(t.touches,u(this.Ed));if(null===i)return;const s=this.Fd(t,i);this.Ud(s,this.qd.If),this.bd=true,this.vd=true;}Nd(t){return t.sourceCapabilities&&void 0!==t.sourceCapabilities.firesTouchEvents?t.sourceCapabilities.firesTouchEvents:cs(t)<this.Bd+500}Ud(t,i){i&&i.call(this.qd,t);}jd(t,i){i&&i.call(this.qd,t);}Fd(t,i){const s=i||t,n=this.Zd.getBoundingClientRect()||{left:0,top:0};return {clientX:s.clientX,clientY:s.clientY,pageX:s.pageX,pageY:s.pageY,screenX:s.screenX,screenY:s.screenY,localX:s.clientX-n.left,localY:s.clientY-n.top,ctrlKey:t.ctrlKey,altKey:t.altKey,shiftKey:t.shiftKey,metaKey:t.metaKey,Bf:!t.type.startsWith("mouse")&&"contextmenu"!==t.type&&"click"!==t.type,Ef:t.type,Af:s.target,a_:t.view,zf:()=>{"touchstart"!==t.type&&_s(t);}}}}function os(t,i){const s=t.clientX-i.clientX,n=t.clientY-i.clientY;return Math.sqrt(s*s+n*n)}function _s(t){t.cancelable&&t.preventDefault();}function us(t){return {_t:t.pageX,ut:t.pageY}}function cs(t){return t.timeStamp||performance.now()}function ds(t,i){for(let s=0;s<t.length;++s)if(t[s].identifier===i)return t[s];return null}class fs{constructor(t,i,s){this.Lf=null,this.Of=null,this.Nf=true,this.Ff=null,this.Wf=t,this.Hf=t.Uf()[i],this.$f=t.Uf()[s],this.qf=document.createElement("tr"),this.qf.style.height="1px",this.Yf=document.createElement("td"),this.Yf.style.position="relative",this.Yf.style.padding="0",this.Yf.style.margin="0",this.Yf.setAttribute("colspan","3"),this.jf(),this.qf.appendChild(this.Yf),this.Nf=this.Wf.N().layout.panes.enableResize,this.Nf?this.Kf():(this.Lf=null,this.Of=null);}m(){null!==this.Of&&this.Of.m();}Xf(){return this.qf}Zf(){return size({width:this.Hf.Zf().width,height:1})}Gf(){return size({width:this.Hf.Gf().width,height:1*window.devicePixelRatio})}Jf(t,i,s){const n=this.Gf();t.fillStyle=this.Wf.N().layout.panes.separatorColor,t.fillRect(i,s,n.width,n.height);}kt(){this.jf(),this.Wf.N().layout.panes.enableResize!==this.Nf&&(this.Nf=this.Wf.N().layout.panes.enableResize,this.Nf?this.Kf():(null!==this.Lf&&(this.Yf.removeChild(this.Lf.Qf),this.Yf.removeChild(this.Lf.tp),this.Lf=null),null!==this.Of&&(this.Of.m(),this.Of=null)));}Kf(){const t=document.createElement("div"),i=t.style;i.position="fixed",i.display="none",i.zIndex="49",i.top="0",i.left="0",i.width="100%",i.height="100%",i.cursor="row-resize",this.Yf.appendChild(t);const s=document.createElement("div"),n=s.style;n.position="absolute",n.zIndex="50",n.top="-4px",n.height="9px",n.width="100%",n.backgroundColor="",n.cursor="row-resize",this.Yf.appendChild(s);const e={if:this.ip.bind(this),Vf:this.sp.bind(this),bf:this.np.bind(this),gf:this.np.bind(this),uf:this.ep.bind(this),lf:this.ep.bind(this),pf:this.rp.bind(this),df:this.rp.bind(this)};this.Of=new ls(s,e,{hf:()=>false,af:()=>true}),this.Lf={tp:s,Qf:t};}jf(){this.Yf.style.background=this.Wf.N().layout.panes.separatorColor;}ip(t){null!==this.Lf&&(this.Lf.tp.style.backgroundColor=this.Wf.N().layout.panes.separatorHoverColor);}sp(t){null!==this.Lf&&null===this.Ff&&(this.Lf.tp.style.backgroundColor="");}np(t){if(null===this.Lf)return;const i=this.Hf.hp().Io()+this.$f.hp().Io(),s=i/(this.Hf.Zf().height+this.$f.Zf().height),n=30*s;i<=2*n||(this.Ff={ap:t.pageY,lp:this.Hf.hp().Io(),op:i-n,_p:i,up:s,cp:n},this.Lf.Qf.style.display="block");}ep(t){const i=this.Ff;if(null===i)return;const s=(t.pageY-i.ap)*i.up,n=Gt(i.lp+s,i.cp,i.op);this.Hf.hp().Bo(n),this.$f.hp().Bo(i._p-n),this.Wf.Qt().Bh();}rp(t){null!==this.Ff&&null!==this.Lf&&(this.Ff=null,this.Lf.Qf.style.display="none");}}function ps(t,i){return t.dp-i.dp}function vs(t,i,s){const n=(t.dp-i.dp)/(t.wt-i.wt);return Math.sign(n)*Math.min(Math.abs(n),s)}class ms{constructor(t,i,s,n){this.fp=null,this.pp=null,this.vp=null,this.mp=null,this.wp=null,this.gp=0,this.Mp=0,this.bp=t,this.Sp=i,this.xp=s,this.Mn=n;}Cp(t,i){if(null!==this.fp){if(this.fp.wt===i)return void(this.fp.dp=t);if(Math.abs(this.fp.dp-t)<this.Mn)return}this.mp=this.vp,this.vp=this.pp,this.pp=this.fp,this.fp={wt:i,dp:t};}le(t,i){if(null===this.fp||null===this.pp)return;if(i-this.fp.wt>50)return;let s=0;const n=vs(this.fp,this.pp,this.Sp),e=ps(this.fp,this.pp),r=[n],h=[e];if(s+=e,null!==this.vp){const t=vs(this.pp,this.vp,this.Sp);if(Math.sign(t)===Math.sign(n)){const i=ps(this.pp,this.vp);if(r.push(t),h.push(i),s+=i,null!==this.mp){const t=vs(this.vp,this.mp,this.Sp);if(Math.sign(t)===Math.sign(n)){const i=ps(this.vp,this.mp);r.push(t),h.push(i),s+=i;}}}}let a=0;for(let t=0;t<r.length;++t)a+=h[t]/s*r[t];Math.abs(a)<this.bp||(this.wp={dp:t,wt:i},this.Mp=a,this.gp=function(t,i){const s=Math.log(i);return Math.log(1*s/-t)/s}(Math.abs(a),this.xp));}Ru(t){const i=u(this.wp),s=t-i.wt;return i.dp+this.Mp*(Math.pow(this.xp,s)-1)/Math.log(this.xp)}Tu(t){return null===this.wp||this.Pp(t)===this.gp}Pp(t){const i=t-u(this.wp).wt;return Math.min(i,this.gp)}}class ws{constructor(t,i){this.kp=void 0,this.yp=void 0,this.Tp=void 0,this.ps=false,this.Rp=t,this.Dp=i,this.Vp();}kt(){this.Vp();}Ip(){this.kp&&this.Rp.removeChild(this.kp),this.yp&&this.Rp.removeChild(this.yp),this.kp=void 0,this.yp=void 0;}Bp(){return this.ps!==this.Ep()||this.Tp!==this.Ap()}Ap(){return this.Dp.Qt().Xi().J(this.Dp.N().layout.textColor)>160?"dark":"light"}Ep(){return this.Dp.N().layout.attributionLogo}zp(){const t=new URL(location.href);return t.hostname?"&utm_source="+t.hostname+t.pathname:""}Vp(){this.Bp()&&(this.Ip(),this.ps=this.Ep(),this.ps&&(this.Tp=this.Ap(),this.yp=document.createElement("style"),this.yp.innerText="a#tv-attr-logo{--fill:#131722;--stroke:#fff;position:absolute;left:10px;bottom:10px;height:19px;width:35px;margin:0;padding:0;border:0;z-index:3;}a#tv-attr-logo[data-dark]{--fill:#D1D4DC;--stroke:#131722;}",this.kp=document.createElement("a"),this.kp.href=`https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart${this.zp()}`,this.kp.title="Charting by TradingView",this.kp.id="tv-attr-logo",this.kp.target="_blank",this.kp.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="35" height="19" fill="none"><g fill-rule="evenodd" clip-path="url(#a)" clip-rule="evenodd"><path fill="var(--stroke)" d="M2 0H0v10h6v9h21.4l.5-1.3 6-15 1-2.7H23.7l-.5 1.3-.2.6a5 5 0 0 0-7-.9V0H2Zm20 17h4l5.2-13 .8-2h-7l-1 2.5-.2.5-1.5 3.8-.3.7V17Zm-.8-10a3 3 0 0 0 .7-2.7A3 3 0 1 0 16.8 7h4.4ZM14 7V2H2v6h6v9h4V7h2Z"/><path fill="var(--fill)" d="M14 2H2v6h6v9h6V2Zm12 15h-7l6-15h7l-6 15Zm-7-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></g><defs><clipPath id="a"><path fill="var(--stroke)" d="M0 0h35v19H0z"/></clipPath></defs></svg>',this.kp.toggleAttribute("data-dark","dark"===this.Tp),this.Rp.appendChild(this.yp),this.Rp.appendChild(this.kp)));}}function gs(t,s){const n=u(t.ownerDocument).createElement("canvas");t.appendChild(n);const e=bindTo(n,{options:{allowResizeObserver:true},transform:(t,i)=>({width:Math.max(t.width,i.width),height:Math.max(t.height,i.height)})});return e.resizeCanvasElement(s),e}function Ms(t){t.width=1,t.height=1,t.getContext("2d")?.clearRect(0,0,1,1);}function bs(t,i,s,n){t.ih&&t.ih(i,s,n);}function Ss(t,i,s,n){t.nt(i,s,n);}function xs(t,i,s,n){const e=t(s,n);for(const t of e){const s=t.Tt(n);null!==s&&i(s);}}function Cs(t,i){return s=>{if(!function(t){return void 0!==t.Ft}(s))return [];return (s.Ft()?.wa()??"")!==i?[]:s.ta?.(t)??[]}}function Ps(t,i,s,n){if(!t.length)return;let e=0;const r=t[0].$t(n,true);let h=1===i?s/2-(t[0].Fi()-r/2):t[0].Fi()-r/2-s/2;h=Math.max(0,h);for(let r=1;r<t.length;r++){const a=t[r],l=t[r-1],o=l.$t(n,false),_=a.Fi(),u=l.Fi();if(1===i?_>u-o:_<u+o){const n=u-o*i;a.Wi(n);const r=n-i*o/2;if((1===i?r<0:r>s)&&h>0){const n=1===i?-1-r:r-s,a=Math.min(n,h);for(let s=e;s<t.length;s++)t[s].Wi(t[s].Fi()+i*a);h-=a;}}else e=r,h=1===i?u-o-_:_-(u+o);}}class ks{constructor(i,s,n,e){this.Yi=null,this.Lp=null,this.Op=false,this.Np=new rt(200),this.Fp=null,this.Wp=0,this.Hp=false,this.Up=()=>{this.Hp||this.Pt.$p().Qt().ar();},this.qp=()=>{this.Hp||this.Pt.$p().Qt().ar();},this.Pt=i,this.Ps=s,this.bl=s.layout,this.Gu=n,this.Yp="left"===e,this.jp=Cs("normal",e),this.Kp=Cs("top",e),this.Xp=Cs("bottom",e),this.Yf=document.createElement("div"),this.Yf.style.height="100%",this.Yf.style.overflow="hidden",this.Yf.style.width="25px",this.Yf.style.left="0",this.Yf.style.position="relative",this.Zp=gs(this.Yf,size({width:16,height:16})),this.Zp.subscribeSuggestedBitmapSizeChanged(this.Up);const r=this.Zp.canvasElement;r.style.position="absolute",r.style.zIndex="1",r.style.left="0",r.style.top="0",this.Gp=gs(this.Yf,size({width:16,height:16})),this.Gp.subscribeSuggestedBitmapSizeChanged(this.qp);const h=this.Gp.canvasElement;h.style.position="absolute",h.style.zIndex="2",h.style.left="0",h.style.top="0";const a={bf:this.np.bind(this),gf:this.np.bind(this),uf:this.ep.bind(this),lf:this.ep.bind(this),Sf:this.Jp.bind(this),pf:this.rp.bind(this),df:this.rp.bind(this),Kd:this.Qp.bind(this),$d:this.Qp.bind(this),if:this.tv.bind(this),Vf:this.sp.bind(this)};this.Of=new ls(this.Gp.canvasElement,a,{hf:()=>!this.Ps.handleScroll.vertTouchDrag,af:()=>true});}m(){this.Of.m(),this.Gp.unsubscribeSuggestedBitmapSizeChanged(this.qp),Ms(this.Gp.canvasElement),this.Gp.dispose(),this.Zp.unsubscribeSuggestedBitmapSizeChanged(this.Up),Ms(this.Zp.canvasElement),this.Zp.dispose(),null!==this.Yi&&this.Yi.no().u(this),this.Yi=null;}Xf(){return this.Yf}P(){return this.bl.fontSize}iv(){const t=this.Gu.N();return this.Fp!==t.k&&(this.Np.In(),this.Fp=t.k),t}sv(){if(null===this.Yi)return 0;let t=0;const i=this.iv(),s=u(this.Zp.canvasElement.getContext("2d",{colorSpace:this.Pt.$p().N().layout.colorSpace}));s.save();const n=this.Yi.Va();s.font=this.nv(),n.length>0&&(t=Math.max(this.Np.Vi(s,n[0].Ga),this.Np.Vi(s,n[n.length-1].Ga)));const e=this.ev();for(let i=e.length;i--;){const n=this.Np.Vi(s,e[i].ri());n>t&&(t=n);}const r=this.Yi.zt();if(null!==r&&null!==this.Lp&&(2!==(h=this.Ps.crosshair).mode&&h.horzLine.visible&&h.horzLine.labelVisible)){const i=this.Yi.Ts(1,r),n=this.Yi.Ts(this.Lp.height-2,r);t=Math.max(t,this.Np.Vi(s,this.Yi.Zi(Math.floor(Math.min(i,n))+.11111111111111,r)),this.Np.Vi(s,this.Yi.Zi(Math.ceil(Math.max(i,n))-.11111111111111,r)));}var h;s.restore();const a=t||34;return hs(Math.ceil(i.S+i.C+i.I+i.B+5+a))}rv(t){null!==this.Lp&&equalSizes(this.Lp,t)||(this.Lp=t,this.Hp=true,this.Zp.resizeCanvasElement(t),this.Gp.resizeCanvasElement(t),this.Hp=false,this.Yf.style.width=`${t.width}px`,this.Yf.style.height=`${t.height}px`);}hv(){return u(this.Lp).width}_s(t){this.Yi!==t&&(null!==this.Yi&&this.Yi.no().u(this),this.Yi=t,t.no().i(this.ul.bind(this),this));}Ft(){return this.Yi}In(){const t=this.Pt.hp();this.Pt.$p().Qt().Zo(t,u(this.Ft()));}av(t){if(null===this.Lp)return;const i={colorSpace:this.Pt.$p().N().layout.colorSpace};if(1!==t){this.lv(),this.Zp.applySuggestedBitmapSize();const t=tryCreateCanvasRenderingTarget2D(this.Zp,i);null!==t&&(t.useBitmapCoordinateSpace((t=>{this.ov(t),this._v(t);})),this.Pt.uv(t,this.Xp),this.cv(t),this.Pt.uv(t,this.jp),this.dv(t));}this.Gp.applySuggestedBitmapSize();const s=tryCreateCanvasRenderingTarget2D(this.Gp,i);null!==s&&(s.useBitmapCoordinateSpace((({context:t,bitmapSize:i})=>{t.clearRect(0,0,i.width,i.height);})),this.fv(s),this.Pt.uv(s,this.Kp));}Gf(){return this.Zp.bitmapSize}Jf(t,i,s){const n=this.Gf();n.width>0&&n.height>0&&t.drawImage(this.Zp.canvasElement,i,s);}kt(){this.Yi?.Va();}np(t){if(null===this.Yi||this.Yi.Ki()||!this.Ps.handleScale.axisPressedMouseMove.price)return;const i=this.Pt.$p().Qt(),s=this.Pt.hp();this.Op=true,i.Uo(s,this.Yi,t.localY);}ep(t){if(null===this.Yi||!this.Ps.handleScale.axisPressedMouseMove.price)return;const i=this.Pt.$p().Qt(),s=this.Pt.hp(),n=this.Yi;i.$o(s,n,t.localY);}Jp(){if(null===this.Yi||!this.Ps.handleScale.axisPressedMouseMove.price)return;const t=this.Pt.$p().Qt(),i=this.Pt.hp(),s=this.Yi;this.Op&&(this.Op=false,t.qo(i,s));}rp(t){if(null===this.Yi||!this.Ps.handleScale.axisPressedMouseMove.price)return;const i=this.Pt.$p().Qt(),s=this.Pt.hp();this.Op=false,i.qo(s,this.Yi);}Qp(t){this.Ps.handleScale.axisDoubleClickReset.price&&this.In();}tv(t){if(null===this.Yi)return;!this.Pt.$p().Qt().N().handleScale.axisPressedMouseMove.price||this.Yi.Le()||this.Yi.Vl()||this.pv(1);}sp(t){this.pv(0);}ev(){const t=[],i=null===this.Yi?void 0:this.Yi;return (s=>{for(let n=0;n<s.length;++n){const e=s[n].Ws(this.Pt.hp(),i);for(let i=0;i<e.length;i++)t.push(e[i]);}})(this.Pt.hp().Dt()),t}ov({context:t,bitmapSize:i}){const{width:s,height:n}=i,e=this.Pt.hp().Qt(),r=e.$(),h=e.Fc();r===h?L(t,0,0,s,n,r):F(t,0,0,s,n,r,h);}_v({context:t,bitmapSize:i,horizontalPixelRatio:s}){if(null===this.Lp||null===this.Yi||!this.Yi.N().borderVisible)return;t.fillStyle=this.Yi.N().borderColor;const n=Math.max(1,Math.floor(this.iv().S*s));let e;e=this.Yp?i.width-n:0,t.fillRect(e,0,n,i.height);}cv(t){if(null===this.Lp||null===this.Yi)return;const i=this.Yi.Va(),s=this.Yi.N(),n=this.iv(),e=this.Yp?this.Lp.width-n.C:0;s.borderVisible&&s.ticksVisible&&t.useBitmapCoordinateSpace((({context:t,horizontalPixelRatio:r,verticalPixelRatio:h})=>{t.fillStyle=s.borderColor;const a=Math.max(1,Math.floor(h)),l=Math.floor(.5*h),o=Math.round(n.C*r);t.beginPath();for(const s of i)t.rect(Math.floor(e*r),Math.round(s.ka*h)-l,o,a);t.fill();})),t.useMediaCoordinateSpace((({context:t})=>{t.font=this.nv(),t.fillStyle=s.textColor??this.bl.textColor,t.textAlign=this.Yp?"right":"left",t.textBaseline="middle";const r=this.Yp?Math.round(e-n.I):Math.round(e+n.C+n.I),h=i.map((i=>this.Np.Di(t,i.Ga)));for(let s=i.length;s--;){const n=i[s];t.fillText(n.Ga,r,n.ka+h[s]);}}));}lv(){if(null===this.Lp||null===this.Yi)return;let t=this.Lp.height/2;const i=[],s=this.Yi.Dt().slice(),n=this.Pt.hp(),e=this.iv();this.Yi===n.$n()&&this.Pt.hp().Dt().forEach((t=>{n.Un(t)&&s.push(t);}));const r=this.Yi.ba()[0],h=this.Yi;s.forEach((s=>{const e=s.Ws(n,h);e.forEach((t=>{t.Wi(null),t.Hi()&&i.push(t);})),r===s&&e.length>0&&(t=e[0].Bi());})),i.forEach((t=>t.Wi(t.Bi())));this.Yi.N().alignLabels&&this.vv(i,e,t);}vv(t,i,s){if(null===this.Lp)return;const n=t.filter((t=>t.Bi()<=s)),e=t.filter((t=>t.Bi()>s));n.sort(((t,i)=>i.Bi()-t.Bi())),n.length&&e.length&&e.push(n[0]),e.sort(((t,i)=>t.Bi()-i.Bi()));for(const s of t){const t=Math.floor(s.$t(i)/2),n=s.Bi();n>-t&&n<t&&s.Wi(t),n>this.Lp.height-t&&n<this.Lp.height+t&&s.Wi(this.Lp.height-t);}Ps(n,1,this.Lp.height,i),Ps(e,-1,this.Lp.height,i);}dv(t){if(null===this.Lp)return;const i=this.ev(),s=this.iv(),n=this.Yp?"right":"left";i.forEach((i=>{if(i.Ui()){i.Tt(u(this.Yi)).nt(t,s,this.Np,n);}}));}fv(t){if(null===this.Lp||null===this.Yi)return;const i=this.Pt.$p().Qt(),s=[],n=this.Pt.hp(),e=i._c().Ws(n,this.Yi);e.length&&s.push(e);const r=this.iv(),h=this.Yp?"right":"left";s.forEach((i=>{i.forEach((i=>{i.Tt(u(this.Yi)).nt(t,r,this.Np,h);}));}));}pv(t){this.Yf.style.cursor=1===t?"ns-resize":"default";}ul(){const t=this.sv();this.Wp<t&&this.Pt.$p().Qt().Bh(),this.Wp=t;}nv(){return x(this.bl.fontSize,this.bl.fontFamily)}}function ys(t,i){return t.Jh?.(i)??[]}function Ts(t,i){return t.Fs?.(i)??[]}function Rs(t,i){return t.us?.(i)??[]}function Ds(t,i){return t.Xh?.(i)??[]}class Vs{constructor(i,s){this.Lp=size({width:0,height:0}),this.mv=null,this.wv=null,this.gv=null,this.Mv=null,this.bv=false,this.Sv=new d,this.xv=new d,this.Cv=0,this.Pv=false,this.kv=null,this.yv=false,this.Tv=null,this.Rv=null,this.Hp=false,this.Up=()=>{this.Hp||null===this.Dv||this.ts().ar();},this.qp=()=>{this.Hp||null===this.Dv||this.ts().ar();},this.Dp=i,this.Dv=s,this.Dv.t_().i(this.Vv.bind(this),this,true),this.Iv=document.createElement("td"),this.Iv.style.padding="0",this.Iv.style.position="relative";const n=document.createElement("div");n.style.width="100%",n.style.height="100%",n.style.position="relative",n.style.overflow="hidden",this.Bv=document.createElement("td"),this.Bv.style.padding="0",this.Ev=document.createElement("td"),this.Ev.style.padding="0",this.Iv.appendChild(n),this.Zp=gs(n,size({width:16,height:16})),this.Zp.subscribeSuggestedBitmapSizeChanged(this.Up);const e=this.Zp.canvasElement;e.style.position="absolute",e.style.zIndex="1",e.style.left="0",e.style.top="0",this.Gp=gs(n,size({width:16,height:16})),this.Gp.subscribeSuggestedBitmapSizeChanged(this.qp);const r=this.Gp.canvasElement;r.style.position="absolute",r.style.zIndex="2",r.style.left="0",r.style.top="0",this.qf=document.createElement("tr"),this.qf.appendChild(this.Bv),this.qf.appendChild(this.Iv),this.qf.appendChild(this.Ev),this.Av(),this.Of=new ls(this.Gp.canvasElement,this,{hf:()=>null===this.kv&&!this.Dp.N().handleScroll.vertTouchDrag,af:()=>null===this.kv&&!this.Dp.N().handleScroll.horzTouchDrag});}m(){null!==this.mv&&this.mv.m(),null!==this.wv&&this.wv.m(),this.gv=null,this.Gp.unsubscribeSuggestedBitmapSizeChanged(this.qp),Ms(this.Gp.canvasElement),this.Gp.dispose(),this.Zp.unsubscribeSuggestedBitmapSizeChanged(this.Up),Ms(this.Zp.canvasElement),this.Zp.dispose(),null!==this.Dv&&(this.Dv.t_().u(this),this.Dv.m()),this.Of.m();}hp(){return u(this.Dv)}zv(t){null!==this.Dv&&this.Dv.t_().u(this),this.Dv=t,null!==this.Dv&&this.Dv.t_().i(Vs.prototype.Vv.bind(this),this,true),this.Av(),this.Dp.Uf().indexOf(this)===this.Dp.Uf().length-1?(this.gv=this.gv??new ws(this.Iv,this.Dp),this.gv.kt()):(this.gv?.Ip(),this.gv=null);}$p(){return this.Dp}Xf(){return this.qf}Av(){if(null!==this.Dv&&(this.Lv(),0!==this.ts().js().length)){if(null!==this.mv){const t=this.Dv.Wo();this.mv._s(u(t));}if(null!==this.wv){const t=this.Dv.Ho();this.wv._s(u(t));}}}Ov(){null!==this.mv&&this.mv.kt(),null!==this.wv&&this.wv.kt();}Io(){return null!==this.Dv?this.Dv.Io():0}Bo(t){this.Dv&&this.Dv.Bo(t);}if(t){if(!this.Dv)return;this.Nv();const i=t.localX,s=t.localY;this.Fv(i,s,t);}bf(t){this.Nv(),this.Wv(),this.Fv(t.localX,t.localY,t);}sf(t){if(!this.Dv)return;this.Nv();const i=t.localX,s=t.localY;this.Fv(i,s,t);}vf(t){null!==this.Dv&&(this.Nv(),this.Hv(t));}Kd(t){null!==this.Dv&&this.Uv(this.xv,t);}$d(t){this.Kd(t);}uf(t){this.Nv(),this.$v(t),this.Fv(t.localX,t.localY,t);}pf(t){null!==this.Dv&&(this.Nv(),this.Pv=false,this.qv(t));}ff(t){null!==this.Dv&&this.Hv(t);}If(t){if(this.Pv=true,null===this.kv){const i={x:t.localX,y:t.localY};this.Yv(i,i,t);}}Vf(t){null!==this.Dv&&(this.Nv(),this.Dv.Qt().ac(null),this.jv());}Kv(){return this.Sv}Xv(){return this.xv}Pf(){this.Cv=1,this.ts().hn();}kf(t,i){if(!this.Dp.N().handleScale.pinch)return;const s=5*(i-this.Cv);this.Cv=i,this.ts().Mc(t._t,s);}gf(t){this.Pv=false,this.yv=null!==this.kv,this.Wv();const i=this.ts()._c();null!==this.kv&&i.Vt()&&(this.Tv={x:i.si(),y:i.ni()},this.kv={x:t.localX,y:t.localY});}lf(t){if(null===this.Dv)return;const i=t.localX,s=t.localY;if(null===this.kv)this.$v(t);else {this.yv=false;const n=u(this.Tv),e=n.x+(i-this.kv.x),r=n.y+(s-this.kv.y);this.Fv(e,r,t);}}df(t){0===this.$p().N().trackingMode.exitMode&&(this.yv=true),this.Zv(),this.qv(t);}jn(t,i){const s=this.Dv;return null===s?null:Pi(s,t,i)}Gv(i,s){u("left"===s?this.mv:this.wv).rv(size({width:i,height:this.Lp.height}));}Zf(){return this.Lp}rv(t){equalSizes(this.Lp,t)||(this.Lp=t,this.Hp=true,this.Zp.resizeCanvasElement(t),this.Gp.resizeCanvasElement(t),this.Hp=false,this.Iv.style.width=t.width+"px",this.Iv.style.height=t.height+"px");}Jv(){const t=u(this.Dv);t.Fo(t.Wo()),t.Fo(t.Ho());for(const i of t.ba())if(t.Un(i)){const s=i.Ft();null!==s&&t.Fo(s),i.Ns();}for(const i of t.s_())i.Ns();}Gf(){return this.Zp.bitmapSize}Jf(t,i,s){const n=this.Gf();n.width>0&&n.height>0&&t.drawImage(this.Zp.canvasElement,i,s);}av(t){if(0===t)return;if(null===this.Dv)return;t>1&&this.Jv(),null!==this.mv&&this.mv.av(t),null!==this.wv&&this.wv.av(t);const i={colorSpace:this.Dp.N().layout.colorSpace};if(1!==t){this.Zp.applySuggestedBitmapSize();const t=tryCreateCanvasRenderingTarget2D(this.Zp,i);null!==t&&(t.useBitmapCoordinateSpace((t=>{this.ov(t);})),this.Dv&&(this.Qv(t,ys),this.tm(t),this.Qv(t,Ts),this.Qv(t,Rs)));}this.Gp.applySuggestedBitmapSize();const s=tryCreateCanvasRenderingTarget2D(this.Gp,i);null!==s&&(s.useBitmapCoordinateSpace((({context:t,bitmapSize:i})=>{t.clearRect(0,0,i.width,i.height);})),this.im(s),this.Qv(s,Ds),this.Qv(s,Rs));}sm(){return this.mv}nm(){return this.wv}uv(t,i){this.Qv(t,i);}Vv(){null!==this.Dv&&this.Dv.t_().u(this),this.Dv=null;}Hv(t){this.Uv(this.Sv,t);}Uv(t,i){const s=i.localX,n=i.localY;t.v()&&t.p(this.ts().Et().uu(s),{x:s,y:n},i);}ov({context:t,bitmapSize:i}){const{width:s,height:n}=i,e=this.ts(),r=e.$(),h=e.Fc();r===h?L(t,0,0,s,n,h):F(t,0,0,s,n,r,h);}tm(t){const i=u(this.Dv),s=i.i_().lr().Tt(i);null!==s&&s.nt(t,false);}im(t){this.rm(t,Ts,Ss,this.ts()._c());}Qv(t,i){const s=u(this.Dv),n=s.Dt(),e=s.s_();for(const s of e)this.rm(t,i,bs,s);for(const s of n)this.rm(t,i,bs,s);for(const s of e)this.rm(t,i,Ss,s);for(const s of n)this.rm(t,i,Ss,s);}rm(t,i,s,n){const e=u(this.Dv),r=e.Qt().hc(),h=null!==r&&r.n_===n,a=null!==r&&h&&void 0!==r.e_?r.e_.Xn:void 0;xs(i,(i=>s(i,t,h,a)),n,e);}Lv(){if(null===this.Dv)return;const t=this.Dp,i=this.Dv.Wo().N().visible,s=this.Dv.Ho().N().visible;i||null===this.mv||(this.Bv.removeChild(this.mv.Xf()),this.mv.m(),this.mv=null),s||null===this.wv||(this.Ev.removeChild(this.wv.Xf()),this.wv.m(),this.wv=null);const n=t.Qt().Vc();i&&null===this.mv&&(this.mv=new ks(this,t.N(),n,"left"),this.Bv.appendChild(this.mv.Xf())),s&&null===this.wv&&(this.wv=new ks(this,t.N(),n,"right"),this.Ev.appendChild(this.wv.Xf()));}hm(t){return t.Bf&&this.Pv||null!==this.kv}am(t){return Math.max(0,Math.min(t,this.Lp.width-1))}lm(t){return Math.max(0,Math.min(t,this.Lp.height-1))}Fv(t,i,s){this.ts().yc(this.am(t),this.lm(i),s,u(this.Dv));}jv(){this.ts().Rc();}Zv(){this.yv&&(this.kv=null,this.jv());}Yv(t,i,s){this.kv=t,this.yv=false,this.Fv(i.x,i.y,s);const n=this.ts()._c();this.Tv={x:n.si(),y:n.ni()};}ts(){return this.Dp.Qt()}qv(t){if(!this.bv)return;const i=this.ts(),s=this.hp();if(i.Ko(s,s.ys()),this.Mv=null,this.bv=false,i.Cc(),null!==this.Rv){const t=performance.now(),s=i.Et();this.Rv.le(s.wu(),t),this.Rv.Tu(t)||i._n(this.Rv);}}Nv(){this.kv=null;}Wv(){if(!this.Dv)return;if(this.ts().hn(),document.activeElement!==document.body&&document.activeElement!==document.documentElement)u(document.activeElement).blur();else {const t=document.getSelection();null!==t&&t.removeAllRanges();}!this.Dv.ys().Ki()&&this.ts().Et().Ki();}$v(t){if(null===this.Dv)return;const i=this.ts(),s=i.Et();if(s.Ki())return;const n=this.Dp.N(),e=n.handleScroll,r=n.kineticScroll;if((!e.pressedMouseMove||t.Bf)&&(!e.horzTouchDrag&&!e.vertTouchDrag||!t.Bf))return;const h=this.Dv.ys(),a=performance.now();if(null!==this.Mv||this.hm(t)||(this.Mv={x:t.clientX,y:t.clientY,ed:a,om:t.localX,_m:t.localY}),null!==this.Mv&&!this.bv&&(this.Mv.x!==t.clientX||this.Mv.y!==t.clientY)){if(t.Bf&&r.touch||!t.Bf&&r.mouse){const t=s.vu();this.Rv=new ms(.2/t,7/t,.997,15/t),this.Rv.Cp(s.wu(),this.Mv.ed);}else this.Rv=null;h.Ki()||i.Yo(this.Dv,h,t.localY),i.Sc(t.localX),this.bv=true;}this.bv&&(h.Ki()||i.jo(this.Dv,h,t.localY),i.xc(t.localX),null!==this.Rv&&this.Rv.Cp(s.wu(),a));}}class Is{constructor(i,s,n,e,r){this.xt=true,this.Lp=size({width:0,height:0}),this.Up=()=>this.av(3),this.Yp="left"===i,this.Gu=n.Vc,this.Ps=s,this.um=e,this.dm=r,this.Yf=document.createElement("div"),this.Yf.style.width="25px",this.Yf.style.height="100%",this.Yf.style.overflow="hidden",this.Zp=gs(this.Yf,size({width:16,height:16})),this.Zp.subscribeSuggestedBitmapSizeChanged(this.Up);}m(){this.Zp.unsubscribeSuggestedBitmapSizeChanged(this.Up),Ms(this.Zp.canvasElement),this.Zp.dispose();}Xf(){return this.Yf}Zf(){return this.Lp}rv(t){equalSizes(this.Lp,t)||(this.Lp=t,this.Zp.resizeCanvasElement(t),this.Yf.style.width=`${t.width}px`,this.Yf.style.height=`${t.height}px`,this.xt=true);}av(t){if(t<3&&!this.xt)return;if(0===this.Lp.width||0===this.Lp.height)return;this.xt=false,this.Zp.applySuggestedBitmapSize();const i=tryCreateCanvasRenderingTarget2D(this.Zp,{colorSpace:this.Ps.layout.colorSpace});null!==i&&i.useBitmapCoordinateSpace((t=>{this.ov(t),this._v(t);}));}Gf(){return this.Zp.bitmapSize}Jf(t,i,s){const n=this.Gf();n.width>0&&n.height>0&&t.drawImage(this.Zp.canvasElement,i,s);}_v({context:t,bitmapSize:i,horizontalPixelRatio:s,verticalPixelRatio:n}){if(!this.um())return;t.fillStyle=this.Ps.timeScale.borderColor;const e=Math.floor(this.Gu.N().S*s),r=Math.floor(this.Gu.N().S*n),h=this.Yp?i.width-e:0;t.fillRect(h,0,e,r);}ov({context:t,bitmapSize:i}){L(t,0,0,i.width,i.height,this.dm());}}function Bs(t){return i=>i.ia?.(t)??[]}const Es=Bs("normal"),As=Bs("top"),zs=Bs("bottom");class Ls{constructor(i,s){this.fm=null,this.pm=null,this.M=null,this.vm=false,this.Lp=size({width:0,height:0}),this.wm=new d,this.Np=new rt(5),this.Hp=false,this.Up=()=>{this.Hp||this.Dp.Qt().ar();},this.qp=()=>{this.Hp||this.Dp.Qt().ar();},this.Dp=i,this.o_=s,this.Ps=i.N().layout,this.kp=document.createElement("tr"),this.gm=document.createElement("td"),this.gm.style.padding="0",this.Mm=document.createElement("td"),this.Mm.style.padding="0",this.Yf=document.createElement("td"),this.Yf.style.height="25px",this.Yf.style.padding="0",this.bm=document.createElement("div"),this.bm.style.width="100%",this.bm.style.height="100%",this.bm.style.position="relative",this.bm.style.overflow="hidden",this.Yf.appendChild(this.bm),this.Zp=gs(this.bm,size({width:16,height:16})),this.Zp.subscribeSuggestedBitmapSizeChanged(this.Up);const n=this.Zp.canvasElement;n.style.position="absolute",n.style.zIndex="1",n.style.left="0",n.style.top="0",this.Gp=gs(this.bm,size({width:16,height:16})),this.Gp.subscribeSuggestedBitmapSizeChanged(this.qp);const e=this.Gp.canvasElement;e.style.position="absolute",e.style.zIndex="2",e.style.left="0",e.style.top="0",this.kp.appendChild(this.gm),this.kp.appendChild(this.Yf),this.kp.appendChild(this.Mm),this.Sm(),this.Dp.Qt().Vo().i(this.Sm.bind(this),this),this.Of=new ls(this.Gp.canvasElement,this,{hf:()=>true,af:()=>!this.Dp.N().handleScroll.horzTouchDrag});}m(){this.Of.m(),null!==this.fm&&this.fm.m(),null!==this.pm&&this.pm.m(),this.Gp.unsubscribeSuggestedBitmapSizeChanged(this.qp),Ms(this.Gp.canvasElement),this.Gp.dispose(),this.Zp.unsubscribeSuggestedBitmapSizeChanged(this.Up),Ms(this.Zp.canvasElement),this.Zp.dispose();}Xf(){return this.kp}xm(){return this.fm}Cm(){return this.pm}bf(t){if(this.vm)return;this.vm=true;const i=this.Dp.Qt();!i.Et().Ki()&&this.Dp.N().handleScale.axisPressedMouseMove.time&&i.gc(t.localX);}gf(t){this.bf(t);}Sf(){const t=this.Dp.Qt();!t.Et().Ki()&&this.vm&&(this.vm=false,this.Dp.N().handleScale.axisPressedMouseMove.time&&t.kc());}uf(t){const i=this.Dp.Qt();!i.Et().Ki()&&this.Dp.N().handleScale.axisPressedMouseMove.time&&i.Pc(t.localX);}lf(t){this.uf(t);}pf(){this.vm=false;const t=this.Dp.Qt();t.Et().Ki()&&!this.Dp.N().handleScale.axisPressedMouseMove.time||t.kc();}df(){this.pf();}Kd(){this.Dp.N().handleScale.axisDoubleClickReset.time&&this.Dp.Qt().cn();}$d(){this.Kd();}if(){this.Dp.Qt().N().handleScale.axisPressedMouseMove.time&&this.pv(1);}Vf(){this.pv(0);}Zf(){return this.Lp}Pm(){return this.wm}km(i,n,e){equalSizes(this.Lp,i)||(this.Lp=i,this.Hp=true,this.Zp.resizeCanvasElement(i),this.Gp.resizeCanvasElement(i),this.Hp=false,this.Yf.style.width=`${i.width}px`,this.Yf.style.height=`${i.height}px`,this.wm.p(i)),null!==this.fm&&this.fm.rv(size({width:n,height:i.height})),null!==this.pm&&this.pm.rv(size({width:e,height:i.height}));}ym(){const t=this.Tm();return Math.ceil(t.S+t.C+t.P+t.A+t.V+t.Rm)}kt(){this.Dp.Qt().Et().Va();}Gf(){return this.Zp.bitmapSize}Jf(t,i,s){const n=this.Gf();n.width>0&&n.height>0&&t.drawImage(this.Zp.canvasElement,i,s);}av(t){if(0===t)return;const i={colorSpace:this.Ps.colorSpace};if(1!==t){this.Zp.applySuggestedBitmapSize();const s=tryCreateCanvasRenderingTarget2D(this.Zp,i);null!==s&&(s.useBitmapCoordinateSpace((t=>{this.ov(t),this._v(t),this.Dm(s,zs);})),this.cv(s),this.Dm(s,Es)),null!==this.fm&&this.fm.av(t),null!==this.pm&&this.pm.av(t);}this.Gp.applySuggestedBitmapSize();const s=tryCreateCanvasRenderingTarget2D(this.Gp,i);null!==s&&(s.useBitmapCoordinateSpace((({context:t,bitmapSize:i})=>{t.clearRect(0,0,i.width,i.height);})),this.Vm([...this.Dp.Qt().js(),this.Dp.Qt()._c()],s),this.Dm(s,As));}Dm(t,i){const s=this.Dp.Qt().js();for(const n of s)xs(i,(i=>bs(i,t,false,void 0)),n,void 0);for(const n of s)xs(i,(i=>Ss(i,t,false,void 0)),n,void 0);}ov({context:t,bitmapSize:i}){L(t,0,0,i.width,i.height,this.Dp.Qt().Fc());}_v({context:t,bitmapSize:i,verticalPixelRatio:s}){if(this.Dp.N().timeScale.borderVisible){t.fillStyle=this.Im();const n=Math.max(1,Math.floor(this.Tm().S*s));t.fillRect(0,0,i.width,n);}}cv(t){const i=this.Dp.Qt().Et(),s=i.Va();if(!s||0===s.length)return;const n=this.o_.maxTickMarkWeight(s),e=this.Tm(),r=i.N();r.borderVisible&&r.ticksVisible&&t.useBitmapCoordinateSpace((({context:t,horizontalPixelRatio:i,verticalPixelRatio:n})=>{t.strokeStyle=this.Im(),t.fillStyle=this.Im();const r=Math.max(1,Math.floor(i)),h=Math.floor(.5*i);t.beginPath();const a=Math.round(e.C*n);for(let n=s.length;n--;){const e=Math.round(s[n].coord*i);t.rect(e-h,0,r,a);}t.fill();})),t.useMediaCoordinateSpace((({context:t})=>{const i=e.S+e.C+e.A+e.P/2;t.textAlign="center",t.textBaseline="middle",t.fillStyle=this.H(),t.font=this.nv();for(const e of s)if(e.weight<n){const s=e.needAlignCoordinate?this.Bm(t,e.coord,e.label):e.coord;t.fillText(e.label,s,i);}this.Dp.N().timeScale.allowBoldLabels&&(t.font=this.Em());for(const e of s)if(e.weight>=n){const s=e.needAlignCoordinate?this.Bm(t,e.coord,e.label):e.coord;t.fillText(e.label,s,i);}}));}Bm(t,i,s){const n=this.Np.Vi(t,s),e=n/2,r=Math.floor(i-e)+.5;return r<0?i+=Math.abs(0-r):r+n>this.Lp.width&&(i-=Math.abs(this.Lp.width-(r+n))),i}Vm(t,i){const s=this.Tm();for(const n of t)for(const t of n.cs())t.Tt().nt(i,s);}Im(){return this.Dp.N().timeScale.borderColor}H(){return this.Ps.textColor}F(){return this.Ps.fontSize}nv(){return x(this.F(),this.Ps.fontFamily)}Em(){return x(this.F(),this.Ps.fontFamily,"bold")}Tm(){null===this.M&&(this.M={S:1,L:NaN,A:NaN,V:NaN,Ji:NaN,C:5,P:NaN,k:"",Gi:new rt,Rm:0});const t=this.M,i=this.nv();if(t.k!==i){const s=this.F();t.P=s,t.k=i,t.A=3*s/12,t.V=3*s/12,t.Ji=9*s/12,t.L=0,t.Rm=4*s/12,t.Gi.In();}return this.M}pv(t){this.Yf.style.cursor=1===t?"ew-resize":"default";}Sm(){const t=this.Dp.Qt(),i=t.N();i.leftPriceScale.visible||null===this.fm||(this.gm.removeChild(this.fm.Xf()),this.fm.m(),this.fm=null),i.rightPriceScale.visible||null===this.pm||(this.Mm.removeChild(this.pm.Xf()),this.pm.m(),this.pm=null);const s={Vc:this.Dp.Qt().Vc()},n=()=>i.leftPriceScale.borderVisible&&t.Et().N().borderVisible,e=()=>t.Fc();i.leftPriceScale.visible&&null===this.fm&&(this.fm=new Is("left",i,s,n,e),this.gm.appendChild(this.fm.Xf())),i.rightPriceScale.visible&&null===this.pm&&(this.pm=new Is("right",i,s,n,e),this.Mm.appendChild(this.pm.Xf()));}}const Os=!!ns&&!!navigator.userAgentData&&navigator.userAgentData.brands.some((t=>t.brand.includes("Chromium")))&&!!ns&&(navigator?.userAgentData?.platform?"Windows"===navigator.userAgentData.platform:navigator.userAgent.toLowerCase().indexOf("win")>=0);class Ns{constructor(t,i,s){var n;this.Am=[],this.zm=[],this.Lm=0,this.sl=0,this.Mo=0,this.Om=0,this.Nm=0,this.Fm=null,this.Wm=false,this.Sv=new d,this.xv=new d,this.Ku=new d,this.Hm=null,this.Um=null,this.Rp=t,this.Ps=i,this.o_=s,this.kp=document.createElement("div"),this.kp.classList.add("tv-lightweight-charts"),this.kp.style.overflow="hidden",this.kp.style.direction="ltr",this.kp.style.width="100%",this.kp.style.height="100%",(n=this.kp).style.userSelect="none",n.style.webkitUserSelect="none",n.style.msUserSelect="none",n.style.MozUserSelect="none",n.style.webkitTapHighlightColor="transparent",this.$m=document.createElement("table"),this.$m.setAttribute("cellspacing","0"),this.kp.appendChild(this.$m),this.qm=this.Ym.bind(this),Fs(this.Ps)&&this.jm(true),this.ts=new Oi(this.Zu.bind(this),this.Ps,s),this.Qt().uc().i(this.Km.bind(this),this),this.Xm=new Ls(this,this.o_),this.$m.appendChild(this.Xm.Xf());const e=i.autoSize&&this.Zm();let r=this.Ps.width,h=this.Ps.height;if(e||0===r||0===h){const i=t.getBoundingClientRect();r=r||i.width,h=h||i.height;}this.Gm(r,h),this.Jm(),t.appendChild(this.kp),this.Qm(),this.ts.Et().Iu().i(this.ts.Bh.bind(this.ts),this),this.ts.Vo().i(this.ts.Bh.bind(this.ts),this);}Qt(){return this.ts}N(){return this.Ps}Uf(){return this.Am}tw(){return this.Xm}m(){this.jm(false),0!==this.Lm&&window.cancelAnimationFrame(this.Lm),this.ts.uc().u(this),this.ts.Et().Iu().u(this),this.ts.Vo().u(this),this.ts.m();for(const t of this.Am)this.$m.removeChild(t.Xf()),t.Kv().u(this),t.Xv().u(this),t.m();this.Am=[];for(const t of this.zm)this.iw(t);this.zm=[],u(this.Xm).m(),null!==this.kp.parentElement&&this.kp.parentElement.removeChild(this.kp),this.Ku.m(),this.Sv.m(),this.xv.m(),this.sw();}Gm(i,s,n=false){if(this.sl===s&&this.Mo===i)return;const e=function(i){const s=Math.floor(i.width),n=Math.floor(i.height);return size({width:s-s%2,height:n-n%2})}(size({width:i,height:s}));this.sl=e.height,this.Mo=e.width;const r=this.sl+"px",h=this.Mo+"px";u(this.kp).style.height=r,u(this.kp).style.width=h,this.$m.style.height=r,this.$m.style.width=h,n?this.nw(G.gn(),performance.now()):this.ts.Bh();}av(t){ void 0===t&&(t=G.gn());for(let i=0;i<this.Am.length;i++)this.Am[i].av(t.en(i).tn);this.Ps.timeScale.visible&&this.Xm.av(t.nn());}hr(t){const i=Fs(this.Ps);this.ts.hr(t);const s=Fs(this.Ps);s!==i&&this.jm(s),t.layout?.panes&&this.ew(),this.Qm(),this.rw(t);}Kv(){return this.Sv}Xv(){return this.xv}uc(){return this.Ku}hw(){null!==this.Fm&&(this.nw(this.Fm,performance.now()),this.Fm=null);const t=this.aw(null),i=document.createElement("canvas");i.width=t.width,i.height=t.height;const s=u(i.getContext("2d"));return this.aw(s),i}lw(t){if("left"===t&&!this.ow())return 0;if("right"===t&&!this._w())return 0;if(0===this.Am.length)return 0;return u("left"===t?this.Am[0].sm():this.Am[0].nm()).hv()}uw(){return this.Ps.autoSize&&null!==this.Hm}tp(){return this.kp}cw(t){this.Um=t,this.Um?this.tp().style.setProperty("cursor",t):this.tp().style.removeProperty("cursor");}dw(){return this.Um}fw(t){return _(this.Am[t]).Zf()}ew(){this.zm.forEach((t=>{t.kt();}));}rw(t){(void 0!==t.autoSize||!this.Hm||void 0===t.width&&void 0===t.height)&&(t.autoSize&&!this.Hm&&this.Zm(),false===t.autoSize&&null!==this.Hm&&this.sw(),t.autoSize||void 0===t.width&&void 0===t.height||this.Gm(t.width||this.Mo,t.height||this.sl));}aw(i){let s=0,n=0;const e=this.Am[0],r=(t,s)=>{let n=0;for(let e=0;e<this.Am.length;e++){const r=this.Am[e],h=u("left"===t?r.sm():r.nm()),a=h.Gf();if(null!==i&&h.Jf(i,s,n),n+=a.height,e<this.Am.length-1){const t=this.zm[e],r=t.Gf();null!==i&&t.Jf(i,s,n),n+=r.height;}}};if(this.ow()){r("left",0);s+=u(e.sm()).Gf().width;}for(let t=0;t<this.Am.length;t++){const e=this.Am[t],r=e.Gf();if(null!==i&&e.Jf(i,s,n),n+=r.height,t<this.Am.length-1){const e=this.zm[t],r=e.Gf();null!==i&&e.Jf(i,s,n),n+=r.height;}}if(s+=e.Gf().width,this._w()){r("right",s);s+=u(e.nm()).Gf().width;}const h=(t,s,n)=>{u("left"===t?this.Xm.xm():this.Xm.Cm()).Jf(u(i),s,n);};if(this.Ps.timeScale.visible){const t=this.Xm.Gf();if(null!==i){let s=0;this.ow()&&(h("left",s,n),s=u(e.sm()).Gf().width),this.Xm.Jf(i,s,n),s+=t.width,this._w()&&h("right",s,n);}n+=t.height;}return size({width:s,height:n})}pw(){let i=0,s=0,n=0;for(const t of this.Am)this.ow()&&(s=Math.max(s,u(t.sm()).sv(),this.Ps.leftPriceScale.minimumWidth)),this._w()&&(n=Math.max(n,u(t.nm()).sv(),this.Ps.rightPriceScale.minimumWidth)),i+=t.Io();s=hs(s),n=hs(n);const e=this.Mo,r=this.sl,h=Math.max(e-s-n,0),a=1*this.zm.length,l=this.Ps.timeScale.visible;let o=l?Math.max(this.Xm.ym(),this.Ps.timeScale.minimumHeight):0;var _;o=(_=o)+_%2;const c=a+o,d=r<c?0:r-c,f=d/i;let p=0;const v=window.devicePixelRatio||1;for(let i=0;i<this.Am.length;++i){const e=this.Am[i];e.zv(this.ts.$s()[i]);let r=0,a=0;a=i===this.Am.length-1?Math.ceil((d-p)*v)/v:Math.round(e.Io()*f*v)/v,r=Math.max(a,2),p+=r,e.rv(size({width:h,height:r})),this.ow()&&e.Gv(s,"left"),this._w()&&e.Gv(n,"right"),e.hp()&&this.ts.cc(e.hp(),r);}this.Xm.km(size({width:l?h:0,height:o}),l?s:0,l?n:0),this.ts.Eo(h),this.Om!==s&&(this.Om=s),this.Nm!==n&&(this.Nm=n);}jm(t){t?this.kp.addEventListener("wheel",this.qm,{passive:false}):this.kp.removeEventListener("wheel",this.qm);}mw(t){switch(t.deltaMode){case t.DOM_DELTA_PAGE:return 120;case t.DOM_DELTA_LINE:return 32}return Os?1/window.devicePixelRatio:1}Ym(t){if(!(0!==t.deltaX&&this.Ps.handleScroll.mouseWheel||0!==t.deltaY&&this.Ps.handleScale.mouseWheel))return;const i=this.mw(t),s=i*t.deltaX/100,n=-i*t.deltaY/100;if(t.cancelable&&t.preventDefault(),0!==n&&this.Ps.handleScale.mouseWheel){const i=Math.sign(n)*Math.min(1,Math.abs(n)),s=t.clientX-this.kp.getBoundingClientRect().left;this.Qt().Mc(s,i);}0!==s&&this.Ps.handleScroll.mouseWheel&&this.Qt().bc(-80*s);}nw(t,i){const s=t.nn();3===s&&this.ww(),3!==s&&2!==s||(this.gw(t),this.Mw(t,i),this.Xm.kt(),this.Am.forEach((t=>{t.Ov();})),3===this.Fm?.nn()&&(this.Fm.vn(t),this.ww(),this.gw(this.Fm),this.Mw(this.Fm,i),t=this.Fm,this.Fm=null)),this.av(t);}Mw(t,i){for(const s of t.pn())this.mn(s,i);}gw(t){const i=this.ts.$s();for(let s=0;s<i.length;s++)t.en(s).sn&&i[s].Go();}mn(t,i){const s=this.ts.Et();switch(t.an){case 0:s.Eu();break;case 1:s.Au(t.Wt);break;case 2:s.dn(t.Wt);break;case 3:s.fn(t.Wt);break;case 4:s.bu();break;case 5:t.Wt.Tu(i)||s.fn(t.Wt.Ru(i));}}Zu(t){null!==this.Fm?this.Fm.vn(t):this.Fm=t,this.Wm||(this.Wm=true,this.Lm=window.requestAnimationFrame((t=>{if(this.Wm=false,this.Lm=0,null!==this.Fm){const i=this.Fm;this.Fm=null,this.nw(i,t);for(const s of i.pn())if(5===s.an&&!s.Wt.Tu(t)){this.Qt()._n(s.Wt);break}}})));}ww(){this.Jm();}iw(t){this.$m.removeChild(t.Xf()),t.m();}Jm(){const t=this.ts.$s(),i=t.length,s=this.Am.length;for(let t=i;t<s;t++){const t=_(this.Am.pop());this.$m.removeChild(t.Xf()),t.Kv().u(this),t.Xv().u(this),t.m();const i=this.zm.pop();void 0!==i&&this.iw(i);}for(let n=s;n<i;n++){const i=new Vs(this,t[n]);if(i.Kv().i(this.bw.bind(this,i),this),i.Xv().i(this.Sw.bind(this,i),this),this.Am.push(i),n>0){const t=new fs(this,n-1,n);this.zm.push(t),this.$m.insertBefore(t.Xf(),this.Xm.Xf());}this.$m.insertBefore(i.Xf(),this.Xm.Xf());}for(let s=0;s<i;s++){const i=t[s],n=this.Am[s];n.hp()!==i?n.zv(i):n.Av();}this.Qm(),this.pw();}xw(t,i,s,n){const e=new Map;if(null!==t){this.ts.js().forEach((i=>{const s=i.Xs().Fr(t);null!==s&&e.set(i,s);}));}let r;if(null!==t){const i=this.ts.Et().ss(t)?.originalTime;void 0!==i&&(r=i);}const h=this.Qt().hc(),a=null!==h&&h.n_ instanceof jt?h.n_:void 0,l=null!==h&&void 0!==h.e_?h.e_.Kn:void 0,o=this.Cw(n);return {Pw:r,Re:t??void 0,kw:i??void 0,yw:-1!==o?o:void 0,Tw:a,Rw:e,Dw:l,Vw:s??void 0}}Cw(t){let i=-1;if(t)i=this.Am.indexOf(t);else {const t=this.Qt()._c().Us();null!==t&&(i=this.Qt().$s().indexOf(t));}return i}bw(t,i,s,n){this.Sv.p((()=>this.xw(i,s,n,t)));}Sw(t,i,s,n){this.xv.p((()=>this.xw(i,s,n,t)));}Km(t,i,s){this.cw(this.Qt().hc()?.h_??null),this.Ku.p((()=>this.xw(t,i,s)));}Qm(){const t=this.Ps.timeScale.visible?"":"none";this.Xm.Xf().style.display=t;}ow(){return this.Am[0].hp().Wo().N().visible}_w(){return this.Am[0].hp().Ho().N().visible}Zm(){return "ResizeObserver"in window&&(this.Hm=new ResizeObserver((t=>{const i=t[t.length-1];i&&this.Gm(i.contentRect.width,i.contentRect.height);})),this.Hm.observe(this.Rp,{box:"border-box"}),true)}sw(){null!==this.Hm&&this.Hm.disconnect(),this.Hm=null;}}function Fs(t){return Boolean(t.handleScroll.mouseWheel||t.handleScale.mouseWheel)}function Ws(t){return void 0===t.open&&void 0===t.value}function Hs(t){return function(t){return void 0!==t.open}(t)||function(t){return void 0!==t.value}(t)}function Us(t,i,s,n){const e=s.value,r={Re:i,wt:t,Wt:[e,e,e,e],Pw:n};return void 0!==s.color&&(r.R=s.color),r}function $s(t,i,s,n){const e=s.value,r={Re:i,wt:t,Wt:[e,e,e,e],Pw:n};return void 0!==s.lineColor&&(r.vt=s.lineColor),void 0!==s.topColor&&(r.mr=s.topColor),void 0!==s.bottomColor&&(r.wr=s.bottomColor),r}function qs(t,i,s,n){const e=s.value,r={Re:i,wt:t,Wt:[e,e,e,e],Pw:n};return void 0!==s.topLineColor&&(r.gr=s.topLineColor),void 0!==s.bottomLineColor&&(r.Mr=s.bottomLineColor),void 0!==s.topFillColor1&&(r.br=s.topFillColor1),void 0!==s.topFillColor2&&(r.Sr=s.topFillColor2),void 0!==s.bottomFillColor1&&(r.Cr=s.bottomFillColor1),void 0!==s.bottomFillColor2&&(r.Pr=s.bottomFillColor2),r}function Ys(t,i,s,n){const e={Re:i,wt:t,Wt:[s.open,s.high,s.low,s.close],Pw:n};return void 0!==s.color&&(e.R=s.color),e}function js(t,i,s,n){const e={Re:i,wt:t,Wt:[s.open,s.high,s.low,s.close],Pw:n};return void 0!==s.color&&(e.R=s.color),void 0!==s.borderColor&&(e.Ht=s.borderColor),void 0!==s.wickColor&&(e.vr=s.wickColor),e}function Ks(t,i,s,n,e){const r=_(e)(s),h=Math.max(...r),a=Math.min(...r),l=r[r.length-1],o=[l,h,a,l],{time:u,color:c,...d}=s;return {Re:i,wt:t,Wt:o,Pw:n,se:d,R:c}}function Xs(t){return void 0!==t.Wt}function Zs(t,i){return void 0!==i.customValues&&(t.Iw=i.customValues),t}function Gs(t){return (i,s,n,e,r,h)=>function(t,i){return i?i(t):Ws(t)}(n,h)?Zs({wt:i,Re:s,Pw:e},n):Zs(t(i,s,n,e,r),n)}function Js(t){return {Candlestick:Gs(js),Bar:Gs(Ys),Area:Gs($s),Baseline:Gs(qs),Histogram:Gs(Us),Line:Gs(Us),Custom:Gs(Ks)}[t]}function Qs(t){return {Re:0,Bw:new Map,Hh:t}}function tn(t,i){if(void 0!==t&&0!==t.length)return {Ew:i.key(t[0].wt),Aw:i.key(t[t.length-1].wt)}}function sn(t){let i;return t.forEach((t=>{ void 0===i&&(i=t.Pw);})),_(i)}class nn{constructor(t){this.zw=new Map,this.Lw=new Map,this.Ow=new Map,this.Nw=[],this.o_=t;}m(){this.zw.clear(),this.Lw.clear(),this.Ow.clear(),this.Nw=[];}Fw(t,i){let s=0!==this.zw.size,n=false;const e=this.Lw.get(t);if(void 0!==e)if(1===this.Lw.size)s=false,n=true,this.zw.clear();else for(const i of this.Nw)i.pointData.Bw.delete(t)&&(n=true);let r=[];if(0!==i.length){const s=i.map((t=>t.time)),e=this.o_.createConverterToInternalObj(i),h=Js(t.Rr()),a=t.da(),l=t.pa();r=i.map(((i,r)=>{const o=e(i.time),_=this.o_.key(o);let u=this.zw.get(_);void 0===u&&(u=Qs(o),this.zw.set(_,u),n=true);const c=h(o,u.Re,i,s[r],a,l);return u.Bw.set(t,c),c}));}s&&this.Ww(),this.Hw(t,r);let h=-1;if(n){const t=[];this.zw.forEach((i=>{t.push({timeWeight:0,time:i.Hh,pointData:i,originalTime:sn(i.Bw)});})),t.sort(((t,i)=>this.o_.key(t.time)-this.o_.key(i.time))),h=this.Uw(t);}return this.$w(t,h,function(t,i,s){const n=tn(t,s),e=tn(i,s);if(void 0!==n&&void 0!==e)return {qw:false,zh:n.Aw>=e.Aw&&n.Ew>=e.Ew}}(this.Lw.get(t),e,this.o_))}Ec(t){return this.Fw(t,[])}Yw(t,i,s){const n=i;!function(t){ void 0===t.Pw&&(t.Pw=t.time);}(n),this.o_.preprocessData(i);const e=this.o_.createConverterToInternalObj([i])(i.time),r=this.Ow.get(t);if(!s&&void 0!==r&&this.o_.key(e)<this.o_.key(r))throw new Error(`Cannot update oldest data, last time=${r}, new time=${e}`);let h=this.zw.get(this.o_.key(e));if(s&&void 0===h)throw new Error("Cannot update non-existing data point when historicalUpdate is true");const a=void 0===h;void 0===h&&(h=Qs(e),this.zw.set(this.o_.key(e),h));const l=Js(t.Rr()),o=t.da(),_=t.pa(),u=l(e,h.Re,i,n.Pw,o,_);h.Bw.set(t,u),s?this.jw(t,u,h.Re):this.Kw(t,u);const c={zh:Xs(u),qw:s};if(!a)return this.$w(t,-1,c);const d={timeWeight:0,time:h.Hh,pointData:h,originalTime:sn(h.Bw)},f=kt(this.Nw,this.o_.key(d.time),((t,i)=>this.o_.key(t.time)<i));this.Nw.splice(f,0,d);for(let t=f;t<this.Nw.length;++t)en(this.Nw[t].pointData,t);return this.o_.fillWeightsForPoints(this.Nw,f),this.$w(t,f,c)}Kw(t,i){let s=this.Lw.get(t);void 0===s&&(s=[],this.Lw.set(t,s));const n=0!==s.length?s[s.length-1]:null;null===n||this.o_.key(i.wt)>this.o_.key(n.wt)?Xs(i)&&s.push(i):Xs(i)?s[s.length-1]=i:s.splice(-1,1),this.Ow.set(t,i.wt);}jw(t,i,s){const n=this.Lw.get(t);if(void 0===n)return;const e=kt(n,s,((t,i)=>t.Re<i));Xs(i)?n[e]=i:n.splice(e,1);}Hw(t,i){0!==i.length?(this.Lw.set(t,i.filter(Xs)),this.Ow.set(t,i[i.length-1].wt)):(this.Lw.delete(t),this.Ow.delete(t));}Ww(){for(const t of this.Nw)0===t.pointData.Bw.size&&this.zw.delete(this.o_.key(t.time));}Uw(t){let i=-1;for(let s=0;s<this.Nw.length&&s<t.length;++s){const n=this.Nw[s],e=t[s];if(this.o_.key(n.time)!==this.o_.key(e.time)){i=s;break}e.timeWeight=n.timeWeight,en(e.pointData,s);}if(-1===i&&this.Nw.length!==t.length&&(i=Math.min(this.Nw.length,t.length)),-1===i)return  -1;for(let s=i;s<t.length;++s)en(t[s].pointData,s);return this.o_.fillWeightsForPoints(t,i),this.Nw=t,i}Xw(){if(0===this.Lw.size)return null;let t=0;return this.Lw.forEach((i=>{0!==i.length&&(t=Math.max(t,i[i.length-1].Re));})),t}$w(t,i,s){const n={Oo:new Map,Et:{ou:this.Xw()}};if(-1!==i)this.Lw.forEach(((i,e)=>{n.Oo.set(e,{se:i,Zw:e===t?s:void 0});})),this.Lw.has(t)||n.Oo.set(t,{se:[],Zw:s}),n.Et.Gw=this.Nw,n.Et.Jw=i;else {const i=this.Lw.get(t);n.Oo.set(t,{se:i||[],Zw:s});}return n}}function en(t,i){t.Re=i,t.Bw.forEach((t=>{t.Re=i;}));}function rn(t,i){return t.wt<i}function hn(t,i){return i<t.wt}function an(t,i,s){const n=i.Uh(),e=i.bi(),r=kt(t,n,rn),h=yt(t,e,hn);if(!s)return {from:r,to:h};let a=r,l=h;return r>0&&r<t.length&&t[r].wt>=n&&(a=r-1),h>0&&h<t.length&&t[h-1].wt<=e&&(l=h+1),{from:a,to:l}}class ln{constructor(t,i,s){this.Qw=true,this.tg=true,this.ig=true,this.sg=[],this.ng=null,this.Jn=t,this.Qn=i,this.eg=s;}kt(t){this.Qw=true,"data"===t&&(this.tg=true),"options"===t&&(this.ig=true);}Tt(){return this.Jn.Vt()?(this.rg(),null===this.ng?null:this.hg):null}ag(){this.sg=this.sg.map((t=>({...t,...this.Jn.Rh().Dr(t.wt)})));}lg(){this.ng=null;}rg(){this.tg&&(this.og(),this.tg=false),this.ig&&(this.ag(),this.ig=false),this.Qw&&(this._g(),this.Qw=false);}_g(){const t=this.Jn.Ft(),i=this.Qn.Et();if(this.lg(),i.Ki()||t.Ki())return;const s=i.Pe();if(null===s)return;if(0===this.Jn.Xs().zr())return;const n=this.Jn.zt();null!==n&&(this.ng=an(this.sg,s,this.eg),this.ug(t,i,n.Wt),this.cg());}}class on{constructor(t,i){this.dg=t,this.Yi=i;}nt(t,i,s){this.dg.draw(t,this.Yi,i,s);}}class _n extends ln{constructor(t,i,s){super(t,i,false),this.sh=s,this.hg=new on(this.sh.renderer(),(i=>{const s=t.zt();return null===s?null:t.Ft().Nt(i,s.Wt)}));}fa(t){return this.sh.priceValueBuilder(t)}va(t){return this.sh.isWhitespace(t)}og(){const t=this.Jn.Rh();this.sg=this.Jn.Xs().Hr().map((i=>({wt:i.Re,_t:NaN,...t.Dr(i.Re),fg:i.se})));}ug(t,i){i._u(this.sg,b(this.ng));}cg(){this.sh.update({bars:this.sg.map(un),barSpacing:this.Qn.Et().vu(),visibleRange:this.ng},this.Jn.N());}}function un(t){return {x:t._t,time:t.wt,originalData:t.fg,barColor:t.cr}}const cn={color:"#2196f3"},dn=(t,i,s)=>{const n=c(s);return new _n(t,i,n)};function fn(t){const i={value:t.Wt[3],time:t.Pw};return void 0!==t.Iw&&(i.customValues=t.Iw),i}function pn(t){const i=fn(t);return void 0!==t.R&&(i.color=t.R),i}function vn(t){const i=fn(t);return void 0!==t.vt&&(i.lineColor=t.vt),void 0!==t.mr&&(i.topColor=t.mr),void 0!==t.wr&&(i.bottomColor=t.wr),i}function mn(t){const i=fn(t);return void 0!==t.gr&&(i.topLineColor=t.gr),void 0!==t.Mr&&(i.bottomLineColor=t.Mr),void 0!==t.br&&(i.topFillColor1=t.br),void 0!==t.Sr&&(i.topFillColor2=t.Sr),void 0!==t.Cr&&(i.bottomFillColor1=t.Cr),void 0!==t.Pr&&(i.bottomFillColor2=t.Pr),i}function wn(t){const i={open:t.Wt[0],high:t.Wt[1],low:t.Wt[2],close:t.Wt[3],time:t.Pw};return void 0!==t.Iw&&(i.customValues=t.Iw),i}function gn(t){const i=wn(t);return void 0!==t.R&&(i.color=t.R),i}function Mn(t){const i=wn(t),{R:s,Ht:n,vr:e}=t;return void 0!==s&&(i.color=s),void 0!==n&&(i.borderColor=n),void 0!==e&&(i.wickColor=e),i}function bn(t){return {Area:vn,Line:pn,Baseline:mn,Histogram:pn,Bar:gn,Candlestick:Mn,Custom:Sn}[t]}function Sn(t){const i=t.Pw;return {...t.se,time:i}}const xn={vertLine:{color:"#9598A1",width:1,style:3,visible:true,labelVisible:true,labelBackgroundColor:"#131722"},horzLine:{color:"#9598A1",width:1,style:3,visible:true,labelVisible:true,labelBackgroundColor:"#131722"},mode:1},Cn={vertLines:{color:"#D6DCDE",style:0,visible:true},horzLines:{color:"#D6DCDE",style:0,visible:true}},Pn={background:{type:"solid",color:"#FFFFFF"},textColor:"#191919",fontSize:12,fontFamily:S,panes:{enableResize:true,separatorColor:"#E0E3EB",separatorHoverColor:"rgba(178, 181, 189, 0.2)"},attributionLogo:true,colorSpace:"srgb",colorParsers:[]},kn={autoScale:true,mode:0,invertScale:false,alignLabels:true,borderVisible:true,borderColor:"#2B2B43",entireTextOnly:false,visible:false,ticksVisible:false,scaleMargins:{bottom:.1,top:.2},minimumWidth:0,ensureEdgeTickMarksVisible:false},yn={rightOffset:0,barSpacing:6,minBarSpacing:.5,maxBarSpacing:0,fixLeftEdge:false,fixRightEdge:false,lockVisibleTimeRangeOnResize:false,rightBarStaysOnScroll:false,borderVisible:true,borderColor:"#2B2B43",visible:true,timeVisible:false,secondsVisible:true,shiftVisibleRangeOnNewBar:true,allowShiftVisibleRangeOnWhitespaceReplacement:false,ticksVisible:false,uniformDistribution:false,minimumHeight:0,allowBoldLabels:true,ignoreWhitespaceIndices:false};function Tn(){return {addDefaultPane:true,width:0,height:0,autoSize:false,layout:Pn,crosshair:xn,grid:Cn,overlayPriceScales:{...kn},leftPriceScale:{...kn,visible:false},rightPriceScale:{...kn,visible:true},timeScale:yn,localization:{locale:ns?navigator.language:"",dateFormat:"dd MMM 'yy"},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:true},handleScale:{axisPressedMouseMove:{time:true,price:true},axisDoubleClickReset:{time:true,price:true},mouseWheel:true,pinch:true},kineticScroll:{mouse:false,touch:true},trackingMode:{exitMode:1}}}class Rn{constructor(t,i,s){this.Wf=t,this.pg=i,this.vg=s??0;}applyOptions(t){this.Wf.Qt().lc(this.pg,t,this.vg);}options(){return this.Yi().N()}width(){return Z(this.pg)?this.Wf.lw(this.pg):0}setVisibleRange(t){this.setAutoScale(false),this.Yi().Wl(new mt(t.from,t.to));}getVisibleRange(){const t=this.Yi().Qe();return null===t?null:{from:t.$e(),to:t.qe()}}setAutoScale(t){this.applyOptions({autoScale:t});}Yi(){return u(this.Wf.Qt().oc(this.pg,this.vg)).Ft}}class Dn{constructor(t,i,s,n){this.Wf=t,this.Pt=s,this.mg=i,this.wg=n;}getHeight(){return this.Pt.$t()}setHeight(t){const i=this.Wf.Qt(),s=i.Hc(this.Pt);i.fc(s,t);}getStretchFactor(){return this.Pt.Io()}setStretchFactor(t){this.Pt.Bo(t),this.Wf.Qt().Bh();}paneIndex(){return this.Wf.Qt().Hc(this.Pt)}moveTo(t){const i=this.paneIndex();i!==t&&(o(t>=0&&t<this.Wf.Uf().length,"Invalid pane index"),this.Wf.Qt().mc(i,t));}getSeries(){return this.Pt.Oo().map((t=>this.mg(t)))??[]}getHTMLElement(){const t=this.Wf.Uf();return t&&0!==t.length&&t[this.paneIndex()]?t[this.paneIndex()].Xf():null}attachPrimitive(t){this.Pt.ua(t),t.attached&&t.attached({chart:this.wg,requestUpdate:()=>this.Pt.Qt().Bh()});}detachPrimitive(t){this.Pt.ca(t);}priceScale(t){if(null===this.Pt.Do(t))throw new Error(`Cannot find price scale with id: ${t}`);return new Rn(this.Wf,t,this.paneIndex())}setPreserveEmptyPane(t){this.Pt.zo(t);}preserveEmptyPane(){return this.Pt.Lo()}addCustomSeries(t,i={},s=0){return this.wg.addCustomSeries(t,i,s)}addSeries(t,i={}){return this.wg.addSeries(t,i,this.paneIndex())}}const Vn={color:"#FF0000",price:0,lineStyle:2,lineWidth:1,lineVisible:true,axisLabelVisible:true,title:"",axisLabelColor:"",axisLabelTextColor:""};class In{constructor(t){this.ir=t;}applyOptions(t){this.ir.hr(t);}options(){return this.ir.N()}gg(){return this.ir}}class Bn{constructor(t,i,s,n,e,r){this.Mg=new d,this.Jn=t,this.bg=i,this.Sg=s,this.o_=e,this.wg=n,this.xg=r;}m(){this.Mg.m();}priceFormatter(){return this.Jn.ra()}priceToCoordinate(t){const i=this.Jn.zt();return null===i?null:this.Jn.Ft().Nt(t,i.Wt)}coordinateToPrice(t){const i=this.Jn.zt();return null===i?null:this.Jn.Ft().Ts(t,i.Wt)}barsInLogicalRange(t){if(null===t)return null;const i=new Di(new yi(t.from,t.to)).k_(),s=this.Jn.Xs();if(s.Ki())return null;const n=s.Fr(i.Uh(),1),e=s.Fr(i.bi(),-1),r=u(s.Lr()),h=u(s.Ks());if(null!==n&&null!==e&&n.Re>e.Re)return {barsBefore:t.from-r,barsAfter:h-t.to};const a={barsBefore:null===n||n.Re===r?t.from-r:n.Re-r,barsAfter:null===e||e.Re===h?h-t.to:h-e.Re};return null!==n&&null!==e&&(a.from=n.Pw,a.to=e.Pw),a}setData(t){this.o_,this.Jn.Rr(),this.bg.Cg(this.Jn,t),this.Pg("full");}update(t,i=false){this.Jn.Rr(),this.bg.kg(this.Jn,t,i),this.Pg("update");}dataByIndex(t,i){const s=this.Jn.Xs().Fr(t,i);if(null===s)return null;return bn(this.seriesType())(s)}data(){const t=bn(this.seriesType());return this.Jn.Xs().Hr().map((i=>t(i)))}subscribeDataChanged(t){this.Mg.i(t);}unsubscribeDataChanged(t){this.Mg._(t);}applyOptions(t){this.Jn.hr(t);}options(){return g(this.Jn.N())}priceScale(){return this.Sg.priceScale(this.Jn.Ft().wa(),this.getPane().paneIndex())}createPriceLine(t){const i=f(g(Vn),t),s=this.Jn.Oh(i);return new In(s)}removePriceLine(t){this.Jn.Nh(t.gg());}priceLines(){return this.Jn.Fh().map((t=>new In(t)))}seriesType(){return this.Jn.Rr()}attachPrimitive(t){this.Jn.ua(t),t.attached&&t.attached({chart:this.wg,series:this,requestUpdate:()=>this.Jn.Qt().Bh(),horzScaleBehavior:this.o_});}detachPrimitive(t){this.Jn.ca(t),t.detached&&t.detached(),this.Jn.Qt().Bh();}getPane(){const t=this.Jn,i=u(this.Jn.Qt().Hn(t));return this.xg(i)}moveToPane(t){this.Jn.Qt().Oc(this.Jn,t);}seriesOrder(){const t=this.Jn.Qt().Hn(this.Jn);return null===t?-1:t.Oo().indexOf(this.Jn)}setSeriesOrder(t){const i=this.Jn.Qt().Hn(this.Jn);null!==i&&i.Qo(this.Jn,t);}Pg(t){this.Mg.v()&&this.Mg.p(t);}}class En{constructor(t,i,s){this.yg=new d,this.z_=new d,this.wm=new d,this.ts=t,this.uh=t.Et(),this.Xm=i,this.uh.Du().i(this.Tg.bind(this)),this.uh.Vu().i(this.Rg.bind(this)),this.Xm.Pm().i(this.Dg.bind(this)),this.o_=s;}m(){this.uh.Du().u(this),this.uh.Vu().u(this),this.Xm.Pm().u(this),this.yg.m(),this.z_.m(),this.wm.m();}scrollPosition(){return this.uh.wu()}scrollToPosition(t,i){i?this.uh.yu(t,1e3):this.ts.fn(t);}scrollToRealTime(){this.uh.ku();}getVisibleRange(){const t=this.uh.su();return null===t?null:{from:t.from.originalTime,to:t.to.originalTime}}setVisibleRange(t){const i={from:this.o_.convertHorzItemToInternal(t.from),to:this.o_.convertHorzItemToInternal(t.to)},s=this.uh.hu(i);this.ts.zc(s);}getVisibleLogicalRange(){const t=this.uh.iu();return null===t?null:{from:t.Uh(),to:t.bi()}}setVisibleLogicalRange(t){o(t.from<=t.to,"The from index cannot be after the to index."),this.ts.zc(t);}resetTimeScale(){this.ts.cn();}fitContent(){this.ts.Eu();}logicalToCoordinate(t){const i=this.ts.Et();return i.Ki()?null:i.qt(t)}coordinateToLogical(t){return this.uh.Ki()?null:this.uh.uu(t)}timeToIndex(t,i){const s=this.o_.convertHorzItemToInternal(t);return this.uh.J_(s,i)}timeToCoordinate(t){const i=this.timeToIndex(t,false);return null===i?null:this.uh.qt(i)}coordinateToTime(t){const i=this.ts.Et(),s=i.uu(t),n=i.ss(s);return null===n?null:n.originalTime}width(){return this.Xm.Zf().width}height(){return this.Xm.Zf().height}subscribeVisibleTimeRangeChange(t){this.yg.i(t);}unsubscribeVisibleTimeRangeChange(t){this.yg._(t);}subscribeVisibleLogicalRangeChange(t){this.z_.i(t);}unsubscribeVisibleLogicalRangeChange(t){this.z_._(t);}subscribeSizeChange(t){this.wm.i(t);}unsubscribeSizeChange(t){this.wm._(t);}applyOptions(t){this.uh.hr(t);}options(){return {...g(this.uh.N()),barSpacing:this.uh.vu()}}Tg(){this.yg.v()&&this.yg.p(this.getVisibleRange());}Rg(){this.z_.v()&&this.z_.p(this.getVisibleLogicalRange());}Dg(t){this.wm.p(t.width,t.height);}}function An(t){if(void 0===t||"custom"===t.type)return;const i=t;void 0!==i.minMove&&void 0===i.precision&&(i.precision=function(t){if(t>=1)return 0;let i=0;for(;i<8;i++){const s=Math.round(t);if(Math.abs(s-t)<1e-8)return i;t*=10;}return i}(i.minMove));}function zn(t){return function(t){if(w(t.handleScale)){const i=t.handleScale;t.handleScale={axisDoubleClickReset:{time:i,price:i},axisPressedMouseMove:{time:i,price:i},mouseWheel:i,pinch:i};}else if(void 0!==t.handleScale){const{axisPressedMouseMove:i,axisDoubleClickReset:s}=t.handleScale;w(i)&&(t.handleScale.axisPressedMouseMove={time:i,price:i}),w(s)&&(t.handleScale.axisDoubleClickReset={time:s,price:s});}const i=t.handleScroll;w(i)&&(t.handleScroll={horzTouchDrag:i,vertTouchDrag:i,mouseWheel:i,pressedMouseMove:i});}(t),t}class Ln{constructor(t,i,s){this.Vg=new Map,this.Ig=new Map,this.Bg=new d,this.Eg=new d,this.Ag=new d,this.$u=new WeakMap,this.zg=new nn(i);const n=void 0===s?g(Tn()):f(g(Tn()),zn(s));this.Lg=i,this.Wf=new Ns(t,n,i),this.Wf.Kv().i((t=>{this.Bg.v()&&this.Bg.p(this.Og(t()));}),this),this.Wf.Xv().i((t=>{this.Eg.v()&&this.Eg.p(this.Og(t()));}),this),this.Wf.uc().i((t=>{this.Ag.v()&&this.Ag.p(this.Og(t()));}),this);const e=this.Wf.Qt();this.Ng=new En(e,this.Wf.tw(),this.Lg);}remove(){this.Wf.Kv().u(this),this.Wf.Xv().u(this),this.Wf.uc().u(this),this.Ng.m(),this.Wf.m(),this.Vg.clear(),this.Ig.clear(),this.Bg.m(),this.Eg.m(),this.Ag.m(),this.zg.m();}resize(t,i,s){this.autoSizeActive()||this.Wf.Gm(t,i,s);}addCustomSeries(t,i={},s=0){const n=(t=>({type:"Custom",isBuiltIn:false,defaultOptions:{...cn,...t.defaultOptions()},Fg:dn,Wg:t}))(c(t));return this.Hg(n,i,s)}addSeries(t,i={},s=0){return this.Hg(t,i,s)}removeSeries(t){const i=_(this.Vg.get(t)),s=this.zg.Ec(i);this.Wf.Qt().Ec(i),this.Ug(s),this.Vg.delete(t),this.Ig.delete(i);}Cg(t,i){this.Ug(this.zg.Fw(t,i));}kg(t,i,s){this.Ug(this.zg.Yw(t,i,s));}subscribeClick(t){this.Bg.i(t);}unsubscribeClick(t){this.Bg._(t);}subscribeCrosshairMove(t){this.Ag.i(t);}unsubscribeCrosshairMove(t){this.Ag._(t);}subscribeDblClick(t){this.Eg.i(t);}unsubscribeDblClick(t){this.Eg._(t);}priceScale(t,i=0){return new Rn(this.Wf,t,i)}timeScale(){return this.Ng}applyOptions(t){this.Wf.hr(zn(t));}options(){return this.Wf.N()}takeScreenshot(){return this.Wf.hw()}addPane(t=false){const i=this.Wf.Qt().Uc();return i.zo(t),this.$g(i)}removePane(t){this.Wf.Qt().dc(t);}swapPanes(t,i){this.Wf.Qt().vc(t,i);}autoSizeActive(){return this.Wf.uw()}chartElement(){return this.Wf.tp()}panes(){return this.Wf.Qt().$s().map((t=>this.$g(t)))}paneSize(t=0){const i=this.Wf.fw(t);return {height:i.height,width:i.width}}setCrosshairPosition(t,i,s){const n=this.Vg.get(s);if(void 0===n)return;const e=this.Wf.Qt().Hn(n);null!==e&&this.Wf.Qt().Tc(t,i,e);}clearCrosshairPosition(){this.Wf.Qt().Rc(true);}horzBehaviour(){return this.Lg}Hg(t,i={},s=0){o(void 0!==t.Fg),An(i.priceFormat),"Candlestick"===t.type&&function(t){ void 0!==t.borderColor&&(t.borderUpColor=t.borderColor,t.borderDownColor=t.borderColor),void 0!==t.wickColor&&(t.wickUpColor=t.wickColor,t.wickDownColor=t.wickColor);}(i);const n=f(g(e),g(t.defaultOptions),i),r=t.Fg,h=new jt(this.Wf.Qt(),t.type,n,r,t.Wg);this.Wf.Qt().Ic(h,s);const a=new Bn(h,this,this,this,this.Lg,(t=>this.$g(t)));return this.Vg.set(a,h),this.Ig.set(h,a),a}Ug(t){const i=this.Wf.Qt();i.Dc(t.Et.ou,t.Et.Gw,t.Et.Jw),t.Oo.forEach(((t,i)=>i.ht(t.se,t.Zw))),i.Et().j_(),i.pu();}qg(t){return _(this.Ig.get(t))}Og(t){const i=new Map;t.Rw.forEach(((t,s)=>{const n=s.Rr(),e=bn(n)(t);if("Custom"!==n)o(Hs(e));else {const t=s.pa();o(!t||false===t(e));}i.set(this.qg(s),e);}));const s=void 0!==t.Tw&&this.Ig.has(t.Tw)?this.qg(t.Tw):void 0;return {time:t.Pw,logical:t.Re,point:t.kw,paneIndex:t.yw,hoveredSeries:s,hoveredObjectId:t.Dw,seriesData:i,sourceEvent:t.Vw}}$g(t){let i=this.$u.get(t);return i||(i=new Dn(this.Wf,(t=>this.qg(t)),t,this),this.$u.set(t,i)),i}}function On(t){if(m(t)){const i=document.getElementById(t);return o(null!==i,`Cannot find element in DOM with id=${t}`),i}return t}function Nn(t,i,s){const n=On(t),e=new Ln(n,i,s);return i.setOptions(e.options()),e}function Fn(t,i){return Nn(t,new ss,ss.ad(i))}class Hn extends ln{constructor(t,i){super(t,i,true);}ug(t,i,s){i._u(this.sg,b(this.ng)),t.$l(this.sg,s,b(this.ng));}Yg(t,i){return {wt:t,gt:i,_t:NaN,ut:NaN}}og(){const t=this.Jn.Rh();this.sg=this.Jn.Xs().Hr().map((i=>{const s=i.Wt[3];return this.jg(i.Re,s,t)}));}}function Un(t,i,s,n,e,r,h){if(0===i.length||n.from>=i.length||n.to<=0)return;const{context:a,horizontalPixelRatio:l,verticalPixelRatio:o}=t,_=i[n.from];let u=r(t,_),c=_;if(n.to-n.from<2){const i=e/2;a.beginPath();const s={_t:_._t-i,ut:_.ut},n={_t:_._t+i,ut:_.ut};a.moveTo(s._t*l,s.ut*o),a.lineTo(n._t*l,n.ut*o),h(t,u,s,n);}else {const e=(i,s)=>{h(t,u,c,s),a.beginPath(),u=i,c=s;};let d=c;a.beginPath(),a.moveTo(_._t*l,_.ut*o);for(let h=n.from+1;h<n.to;++h){d=i[h];const n=r(t,d);switch(s){case 0:a.lineTo(d._t*l,d.ut*o);break;case 1:a.lineTo(d._t*l,i[h-1].ut*o),n!==u&&(e(n,d),a.lineTo(d._t*l,i[h-1].ut*o)),a.lineTo(d._t*l,d.ut*o);break;case 2:{const[t,s]=jn(i,h-1,h);a.bezierCurveTo(t._t*l,t.ut*o,s._t*l,s.ut*o,d._t*l,d.ut*o);break}}1!==s&&n!==u&&(e(n,d),a.moveTo(d._t*l,d.ut*o));}(c!==d||c===d&&1===s)&&h(t,u,c,d);}}const $n=6;function qn(t,i){return {_t:t._t-i._t,ut:t.ut-i.ut}}function Yn(t,i){return {_t:t._t/i,ut:t.ut/i}}function jn(t,i,s){const n=Math.max(0,i-1),e=Math.min(t.length-1,s+1);var r,h;return [(r=t[i],h=Yn(qn(t[s],t[n]),$n),{_t:r._t+h._t,ut:r.ut+h.ut}),qn(t[s],Yn(qn(t[e],t[i]),$n))]}function Kn(t,i){const s=t.context;s.strokeStyle=i,s.stroke();}class Xn extends R{constructor(){super(...arguments),this.rt=null;}ht(t){this.rt=t;}et(t){if(null===this.rt)return;const{ot:i,lt:s,Kg:n,Xg:e,ct:r,Xt:h,Zg:l}=this.rt;if(null===s)return;const o=t.context;o.lineCap="butt",o.lineWidth=r*t.verticalPixelRatio,a(o,h),o.lineJoin="round";const _=this.Gg.bind(this);void 0!==e&&Un(t,i,e,s,n,_,Kn),l&&function(t,i,s,n,e){if(n.to-n.from<=0)return;const{horizontalPixelRatio:r,verticalPixelRatio:h,context:a}=t;let l=null;const o=Math.max(1,Math.floor(r))%2/2,_=s*h+o;for(let s=n.to-1;s>=n.from;--s){const n=i[s];if(n){const i=e(t,n);i!==l&&(a.beginPath(),null!==l&&a.fill(),a.fillStyle=i,l=i);const s=Math.round(n._t*r)+o,u=n.ut*h;a.moveTo(s,u),a.arc(s,u,_,0,2*Math.PI);}}a.fill();}(t,i,l,s,_);}}class Zn extends Xn{Gg(t,i){return i.vt}}class Gn extends Hn{constructor(){super(...arguments),this.hg=new Zn;}jg(t,i,s){return {...this.Yg(t,i),...s.Dr(t)}}cg(){const t=this.Jn.N(),i={ot:this.sg,Xt:t.lineStyle,Xg:t.lineVisible?t.lineType:void 0,ct:t.lineWidth,Zg:t.pointMarkersVisible?t.pointMarkersRadius||t.lineWidth/2+2:void 0,lt:this.ng,Kg:this.Qn.Et().vu()};this.hg.ht(i);}}const Jn={type:"Line",isBuiltIn:true,defaultOptions:{color:"#2196f3",lineStyle:0,lineWidth:3,lineType:0,lineVisible:true,crosshairMarkerVisible:true,crosshairMarkerRadius:4,crosshairMarkerBorderColor:"",crosshairMarkerBorderWidth:2,crosshairMarkerBackgroundColor:"",lastPriceAnimation:0,pointMarkersVisible:false},Fg:(t,i)=>new Gn(t,i)};function le(t,i,s,n,e){const{context:r,horizontalPixelRatio:h,verticalPixelRatio:a}=i;r.lineTo(e._t*h,t*a),r.lineTo(n._t*h,t*a),r.closePath(),r.fillStyle=s,r.fill();}class oe extends R{constructor(){super(...arguments),this.rt=null;}ht(t){this.rt=t;}et(t){if(null===this.rt)return;const{ot:i,lt:s,Kg:n,ct:e,Xt:r,Xg:h}=this.rt,l=this.rt.eM??(this.rt.rM?0:t.mediaSize.height);if(null===s)return;const o=t.context;o.lineCap="butt",o.lineJoin="round",o.lineWidth=e,a(o,r),o.lineWidth=1,Un(t,i,h,s,n,this.hM.bind(this),le.bind(null,l));}}class _e{aM(t,i){const s=this.lM,{oM:n,_M:e,uM:r,cM:h,eM:a,dM:l,fM:o}=i;if(void 0===this.pM||void 0===s||s.oM!==n||s._M!==e||s.uM!==r||s.cM!==h||s.eM!==a||s.dM!==l||s.fM!==o){const{verticalPixelRatio:s}=t,_=a||l>0?s:1,u=l*_,c=o===t.bitmapSize.height?o:o*_,d=(a??0)*_,f=t.context.createLinearGradient(0,u,0,c);if(f.addColorStop(0,n),null!=a){const t=Gt((d-u)/(c-u),0,1);f.addColorStop(t,e),f.addColorStop(t,r);}f.addColorStop(1,h),this.pM=f,this.lM=i;}return this.pM}}class ue extends oe{constructor(){super(...arguments),this.vM=new _e;}hM(t,i){const s=this.rt;return this.vM.aM(t,{oM:i.br,_M:i.Sr,uM:i.Cr,cM:i.Pr,eM:s.eM,dM:s.dM??0,fM:s.fM??t.bitmapSize.height})}}class ce extends Xn{constructor(){super(...arguments),this.mM=new _e;}Gg(t,i){const s=this.rt;return this.mM.aM(t,{oM:i.gr,_M:i.gr,uM:i.Mr,cM:i.Mr,eM:s.eM,dM:s.dM??0,fM:s.fM??t.bitmapSize.height})}}class de extends Hn{constructor(t,i){super(t,i),this.hg=new T,this.wM=new ue,this.gM=new ce,this.hg.st([this.wM,this.gM]);}jg(t,i,s){return {...this.Yg(t,i),...s.Dr(t)}}cg(){const t=this.Jn.zt();if(null===t)return;const i=this.Jn.N(),s=this.Jn.Ft().Nt(i.baseValue.price,t.Wt),n=this.Qn.Et().vu();if(null===this.ng||0===this.sg.length)return;let e,r;if(i.relativeGradient){e=this.sg[this.ng.from].ut,r=this.sg[this.ng.from].ut;for(let t=this.ng.from;t<this.ng.to;t++){const i=this.sg[t];i.ut<e&&(e=i.ut),i.ut>r&&(r=i.ut);}}this.wM.ht({ot:this.sg,ct:i.lineWidth,Xt:i.lineStyle,Xg:i.lineType,eM:s,dM:e,fM:r,rM:false,lt:this.ng,Kg:n}),this.gM.ht({ot:this.sg,ct:i.lineWidth,Xt:i.lineStyle,Xg:i.lineVisible?i.lineType:void 0,Zg:i.pointMarkersVisible?i.pointMarkersRadius||i.lineWidth/2+2:void 0,eM:s,dM:e,fM:r,lt:this.ng,Kg:n});}}const fe={type:"Baseline",isBuiltIn:true,defaultOptions:{baseValue:{type:"price",price:0},relativeGradient:false,topFillColor1:"rgba(38, 166, 154, 0.28)",topFillColor2:"rgba(38, 166, 154, 0.05)",topLineColor:"rgba(38, 166, 154, 1)",bottomFillColor1:"rgba(239, 83, 80, 0.05)",bottomFillColor2:"rgba(239, 83, 80, 0.28)",bottomLineColor:"rgba(239, 83, 80, 1)",lineWidth:3,lineStyle:0,lineType:0,lineVisible:true,crosshairMarkerVisible:true,crosshairMarkerRadius:4,crosshairMarkerBorderColor:"",crosshairMarkerBorderWidth:2,crosshairMarkerBackgroundColor:"",lastPriceAnimation:0,pointMarkersVisible:false},Fg:(t,i)=>new de(t,i)};class pe extends oe{constructor(){super(...arguments),this.vM=new _e;}hM(t,i){return this.vM.aM(t,{oM:i.mr,_M:"",uM:"",cM:i.wr,dM:this.rt?.dM??0,fM:t.bitmapSize.height})}}class ve extends Hn{constructor(t,i){super(t,i),this.hg=new T,this.MM=new pe,this.bM=new Zn,this.hg.st([this.MM,this.bM]);}jg(t,i,s){return {...this.Yg(t,i),...s.Dr(t)}}cg(){const t=this.Jn.N();if(null===this.ng||0===this.sg.length)return;let i;if(t.relativeGradient){i=this.sg[this.ng.from].ut;for(let t=this.ng.from;t<this.ng.to;t++){const s=this.sg[t];s.ut<i&&(i=s.ut);}}this.MM.ht({Xg:t.lineType,ot:this.sg,Xt:t.lineStyle,ct:t.lineWidth,eM:null,dM:i,rM:t.invertFilledArea,lt:this.ng,Kg:this.Qn.Et().vu()}),this.bM.ht({Xg:t.lineVisible?t.lineType:void 0,ot:this.sg,Xt:t.lineStyle,ct:t.lineWidth,lt:this.ng,Kg:this.Qn.Et().vu(),Zg:t.pointMarkersVisible?t.pointMarkersRadius||t.lineWidth/2+2:void 0});}}const me={type:"Area",isBuiltIn:true,defaultOptions:{topColor:"rgba( 46, 220, 135, 0.4)",bottomColor:"rgba( 40, 221, 100, 0)",invertFilledArea:false,relativeGradient:false,lineColor:"#33D778",lineStyle:0,lineWidth:3,lineType:0,lineVisible:true,crosshairMarkerVisible:true,crosshairMarkerRadius:4,crosshairMarkerBorderColor:"",crosshairMarkerBorderWidth:2,crosshairMarkerBackgroundColor:"",lastPriceAnimation:0,pointMarkersVisible:false},Fg:(t,i)=>new ve(t,i)};class we extends R{constructor(){super(...arguments),this.Yt=null,this.SM=0,this.xM=0;}ht(t){this.Yt=t;}et({context:t,horizontalPixelRatio:i,verticalPixelRatio:s}){if(null===this.Yt||0===this.Yt.Xs.length||null===this.Yt.lt)return;if(this.SM=this.CM(i),this.SM>=2){Math.max(1,Math.floor(i))%2!=this.SM%2&&this.SM--;}this.xM=this.Yt.PM?Math.min(this.SM,Math.floor(i)):this.SM;let n=null;const e=this.xM<=this.SM&&this.Yt.vu>=Math.floor(1.5*i);for(let r=this.Yt.lt.from;r<this.Yt.lt.to;++r){const h=this.Yt.Xs[r];n!==h.cr&&(t.fillStyle=h.cr,n=h.cr);const a=Math.floor(.5*this.xM),l=Math.round(h._t*i),o=l-a,_=this.xM,u=o+_-1,c=Math.min(h.Kl,h.Xl),d=Math.max(h.Kl,h.Xl),f=Math.round(c*s)-a,p=Math.round(d*s)+a,v=Math.max(p-f,this.xM);t.fillRect(o,f,_,v);const m=Math.ceil(1.5*this.SM);if(e){if(this.Yt.kM){const i=l-m;let n=Math.max(f,Math.round(h.jl*s)-a),e=n+_-1;e>f+v-1&&(e=f+v-1,n=e-_+1),t.fillRect(i,n,o-i,e-n+1);}const i=l+m;let n=Math.max(f,Math.round(h.Zl*s)-a),e=n+_-1;e>f+v-1&&(e=f+v-1,n=e-_+1),t.fillRect(u+1,n,i-u,e-n+1);}}}CM(t){const i=Math.floor(t);return Math.max(i,Math.floor(function(t,i){return Math.floor(.3*t*i)}(u(this.Yt).vu,t)))}}class ge extends ln{constructor(t,i){super(t,i,false);}ug(t,i,s){i._u(this.sg,b(this.ng)),t.Yl(this.sg,s,b(this.ng));}yM(t,i,s){return {wt:t,qh:i.Wt[0],Yh:i.Wt[1],jh:i.Wt[2],Kh:i.Wt[3],_t:NaN,jl:NaN,Kl:NaN,Xl:NaN,Zl:NaN}}og(){const t=this.Jn.Rh();this.sg=this.Jn.Xs().Hr().map((i=>this.jg(i.Re,i,t)));}}class Me extends ge{constructor(){super(...arguments),this.hg=new we;}jg(t,i,s){return {...this.yM(t,i,s),...s.Dr(t)}}cg(){const t=this.Jn.N();this.hg.ht({Xs:this.sg,vu:this.Qn.Et().vu(),kM:t.openVisible,PM:t.thinBars,lt:this.ng});}}const be={type:"Bar",isBuiltIn:true,defaultOptions:{upColor:"#26a69a",downColor:"#ef5350",openVisible:true,thinBars:true},Fg:(t,i)=>new Me(t,i)};class Se extends R{constructor(){super(...arguments),this.Yt=null,this.SM=0;}ht(t){this.Yt=t;}et(t){if(null===this.Yt||0===this.Yt.Xs.length||null===this.Yt.lt)return;const{horizontalPixelRatio:i}=t;if(this.SM=function(t,i){if(t>=2.5&&t<=4)return Math.floor(3*i);const s=1-.2*Math.atan(Math.max(4,t)-4)/(.5*Math.PI),n=Math.floor(t*s*i),e=Math.floor(t*i),r=Math.min(n,e);return Math.max(Math.floor(i),r)}(this.Yt.vu,i),this.SM>=2){Math.floor(i)%2!=this.SM%2&&this.SM--;}const s=this.Yt.Xs;this.Yt.TM&&this.RM(t,s,this.Yt.lt),this.Yt.Mi&&this._v(t,s,this.Yt.lt);const n=this.DM(i);(!this.Yt.Mi||this.SM>2*n)&&this.VM(t,s,this.Yt.lt);}RM(t,i,s){if(null===this.Yt)return;const{context:n,horizontalPixelRatio:e,verticalPixelRatio:r}=t;let h="",a=Math.min(Math.floor(e),Math.floor(this.Yt.vu*e));a=Math.max(Math.floor(e),Math.min(a,this.SM));const l=Math.floor(.5*a);let o=null;for(let t=s.from;t<s.to;t++){const s=i[t];s.pr!==h&&(n.fillStyle=s.pr,h=s.pr);const _=Math.round(Math.min(s.jl,s.Zl)*r),u=Math.round(Math.max(s.jl,s.Zl)*r),c=Math.round(s.Kl*r),d=Math.round(s.Xl*r);let f=Math.round(e*s._t)-l;const p=f+a-1;null!==o&&(f=Math.max(o+1,f),f=Math.min(f,p));const v=p-f+1;n.fillRect(f,c,v,_-c),n.fillRect(f,u+1,v,d-u),o=p;}}DM(t){let i=Math.floor(1*t);this.SM<=2*i&&(i=Math.floor(.5*(this.SM-1)));const s=Math.max(Math.floor(t),i);return this.SM<=2*s?Math.max(Math.floor(t),Math.floor(1*t)):s}_v(t,i,s){if(null===this.Yt)return;const{context:n,horizontalPixelRatio:e,verticalPixelRatio:r}=t;let h="";const a=this.DM(e);let l=null;for(let t=s.from;t<s.to;t++){const s=i[t];s.dr!==h&&(n.fillStyle=s.dr,h=s.dr);let o=Math.round(s._t*e)-Math.floor(.5*this.SM);const _=o+this.SM-1,u=Math.round(Math.min(s.jl,s.Zl)*r),c=Math.round(Math.max(s.jl,s.Zl)*r);if(null!==l&&(o=Math.max(l+1,o),o=Math.min(o,_)),this.Yt.vu*e>2*a)z(n,o,u,_-o+1,c-u+1,a);else {const t=_-o+1;n.fillRect(o,u,t,c-u+1);}l=_;}}VM(t,i,s){if(null===this.Yt)return;const{context:n,horizontalPixelRatio:e,verticalPixelRatio:r}=t;let h="";const a=this.DM(e);for(let t=s.from;t<s.to;t++){const s=i[t];let l=Math.round(Math.min(s.jl,s.Zl)*r),o=Math.round(Math.max(s.jl,s.Zl)*r),_=Math.round(s._t*e)-Math.floor(.5*this.SM),u=_+this.SM-1;if(s.cr!==h){const t=s.cr;n.fillStyle=t,h=t;}this.Yt.Mi&&(_+=a,l+=a,u-=a,o-=a),l>o||n.fillRect(_,l,u-_+1,o-l+1);}}}class xe extends ge{constructor(){super(...arguments),this.hg=new Se;}jg(t,i,s){return {...this.yM(t,i,s),...s.Dr(t)}}cg(){const t=this.Jn.N();this.hg.ht({Xs:this.sg,vu:this.Qn.Et().vu(),TM:t.wickVisible,Mi:t.borderVisible,lt:this.ng});}}const Ce={type:"Candlestick",isBuiltIn:true,defaultOptions:{upColor:"#26a69a",downColor:"#ef5350",wickVisible:true,borderVisible:true,borderColor:"#378658",borderUpColor:"#26a69a",borderDownColor:"#ef5350",wickColor:"#737375",wickUpColor:"#26a69a",wickDownColor:"#ef5350"},Fg:(t,i)=>new xe(t,i)};class Pe extends R{constructor(){super(...arguments),this.Yt=null,this.IM=[];}ht(t){this.Yt=t,this.IM=[];}et({context:t,horizontalPixelRatio:i,verticalPixelRatio:s}){if(null===this.Yt||0===this.Yt.ot.length||null===this.Yt.lt)return;this.IM.length||this.BM(i);const n=Math.max(1,Math.floor(s)),e=Math.round(this.Yt.EM*s)-Math.floor(n/2),r=e+n;for(let i=this.Yt.lt.from;i<this.Yt.lt.to;i++){const h=this.Yt.ot[i],a=this.IM[i-this.Yt.lt.from],l=Math.round(h.ut*s);let o,_;t.fillStyle=h.cr,l<=e?(o=l,_=r):(o=e,_=l-Math.floor(n/2)+n),t.fillRect(a.Uh,o,a.bi-a.Uh+1,_-o);}}BM(t){if(null===this.Yt||0===this.Yt.ot.length||null===this.Yt.lt)return void(this.IM=[]);const i=Math.ceil(this.Yt.vu*t)<=1?0:Math.max(1,Math.floor(t)),s=Math.round(this.Yt.vu*t)-i;this.IM=new Array(this.Yt.lt.to-this.Yt.lt.from);for(let i=this.Yt.lt.from;i<this.Yt.lt.to;i++){const n=this.Yt.ot[i],e=Math.round(n._t*t);let r,h;if(s%2){const t=(s-1)/2;r=e-t,h=e+t;}else {const t=s/2;r=e-t,h=e+t-1;}this.IM[i-this.Yt.lt.from]={Uh:r,bi:h,AM:e,ne:n._t*t,wt:n.wt};}for(let t=this.Yt.lt.from+1;t<this.Yt.lt.to;t++){const s=this.IM[t-this.Yt.lt.from],n=this.IM[t-this.Yt.lt.from-1];s.wt===n.wt+1&&(s.Uh-n.bi!==i+1&&(n.AM>n.ne?n.bi=s.Uh-i-1:s.Uh=n.bi+i+1));}let n=Math.ceil(this.Yt.vu*t);for(let t=this.Yt.lt.from;t<this.Yt.lt.to;t++){const i=this.IM[t-this.Yt.lt.from];i.bi<i.Uh&&(i.bi=i.Uh);const s=i.bi-i.Uh+1;n=Math.min(s,n);}if(i>0&&n<4)for(let t=this.Yt.lt.from;t<this.Yt.lt.to;t++){const i=this.IM[t-this.Yt.lt.from];i.bi-i.Uh+1>n&&(i.AM>i.ne?i.bi-=1:i.Uh+=1);}}}class ke extends Hn{constructor(){super(...arguments),this.hg=new Pe;}jg(t,i,s){return {...this.Yg(t,i),...s.Dr(t)}}cg(){const t={ot:this.sg,vu:this.Qn.Et().vu(),lt:this.ng,EM:this.Jn.Ft().Nt(this.Jn.N().base,u(this.Jn.zt()).Wt)};this.hg.ht(t);}}const ye={type:"Histogram",isBuiltIn:true,defaultOptions:{color:"#26a69a",base:0},Fg:(t,i)=>new ke(t,i)};class Ye{constructor(t,i){this.Jn=t,this.ah=i,this.LM();}detach(){this.Jn.detachPrimitive(this.ah);}getSeries(){return this.Jn}applyOptions(t){this.ah&&this.ah.hr&&this.ah.hr(t);}LM(){this.Jn.attachPrimitive(this.ah);}}const je={zOrder:"normal"};function Ke(t,i){return Qt(Math.min(Math.max(t,12),30)*i)}function Xe(t,i){switch(t){case "arrowDown":case "arrowUp":return Ke(i,1);case "circle":return Ke(i,.8);case "square":return Ke(i,.7)}}function Ze(t){return function(t){const i=Math.ceil(t);return i%2!=0?i-1:i}(Ke(t,1))}function Ge(t){return Math.max(Ke(t,.1),3)}function Je(t,i,s){return i?t:s?Math.ceil(t/2):0}function Qe(t,i,s,n){const e=(Xe("arrowUp",n)-1)/2*s.hb,r=(Qt(n/2)-1)/2*s.hb;i.beginPath(),t?(i.moveTo(s._t-e,s.ut),i.lineTo(s._t,s.ut-e),i.lineTo(s._t+e,s.ut),i.lineTo(s._t+r,s.ut),i.lineTo(s._t+r,s.ut+e),i.lineTo(s._t-r,s.ut+e),i.lineTo(s._t-r,s.ut)):(i.moveTo(s._t-e,s.ut),i.lineTo(s._t,s.ut+e),i.lineTo(s._t+e,s.ut),i.lineTo(s._t+r,s.ut),i.lineTo(s._t+r,s.ut-e),i.lineTo(s._t-r,s.ut-e),i.lineTo(s._t-r,s.ut)),i.fill();}function tr(t,i,s,n,e,r){const h=(Xe("arrowUp",n)-1)/2,a=(Qt(n/2)-1)/2;if(e>=i-a-2&&e<=i+a+2&&r>=(t?s:s-h)-2&&r<=(t?s+h:s)+2)return  true;return (()=>{if(e<i-h-3||e>i+h+3||r<(t?s-h-3:s)||r>(t?s:s+h+3))return  false;const n=Math.abs(e-i);return Math.abs(r-s)+3>=n/2})()}class ir{constructor(){this.Yt=null,this.On=new rt,this.F=-1,this.W="",this.Fp="",this.ab="normal";}ht(t){this.Yt=t;}Nn(t,i,s){this.F===t&&this.W===i||(this.F=t,this.W=i,this.Fp=x(t,i),this.On.In()),this.ab=s;}jn(t,i){if(null===this.Yt||null===this.Yt.lt)return null;for(let s=this.Yt.lt.from;s<this.Yt.lt.to;s++){const n=this.Yt.ot[s];if(n&&nr(n,t,i))return {zOrder:"normal",externalId:n.Kn??""}}return null}draw(t){"aboveSeries"!==this.ab&&t.useBitmapCoordinateSpace((t=>{this.et(t);}));}drawBackground(t){"aboveSeries"===this.ab&&t.useBitmapCoordinateSpace((t=>{this.et(t);}));}et({context:t,horizontalPixelRatio:i,verticalPixelRatio:s}){if(null!==this.Yt&&null!==this.Yt.lt){t.textBaseline="middle",t.font=this.Fp;for(let n=this.Yt.lt.from;n<this.Yt.lt.to;n++){const e=this.Yt.ot[n];void 0!==e.ri&&(e.ri.Qi=this.On.Vi(t,e.ri.lb),e.ri.$t=this.F,e.ri._t=e._t-e.ri.Qi/2),sr(e,t,i,s);}}}}function sr(t,i,s,n){i.fillStyle=t.R,void 0!==t.ri&&function(t,i,s,n,e,r){t.save(),t.scale(e,r),t.fillText(i,s,n),t.restore();}(i,t.ri.lb,t.ri._t,t.ri.ut,s,n),function(t,i,s){if(0===t.zr)return;switch(t.ob){case "arrowDown":return void Qe(false,i,s,t.zr);case "arrowUp":return void Qe(true,i,s,t.zr);case "circle":return void function(t,i,s){const n=(Xe("circle",s)-1)/2;t.beginPath(),t.arc(i._t,i.ut,n*i.hb,0,2*Math.PI,false),t.fill();}(i,s,t.zr);case "square":return void function(t,i,s){const n=Xe("square",s),e=(n-1)*i.hb/2,r=i._t-e,h=i.ut-e;t.fillRect(r,h,n*i.hb,n*i.hb);}(i,s,t.zr)}t.ob;}(t,i,function(t,i,s){const n=Math.max(1,Math.floor(i))%2/2;return {_t:Math.round(t._t*i)+n,ut:t.ut*s,hb:i}}(t,s,n));}function nr(t,i,s){return !(void 0===t.ri||!function(t,i,s,n,e,r){const h=n/2;return e>=t&&e<=t+s&&r>=i-h&&r<=i+h}(t.ri._t,t.ri.ut,t.ri.Qi,t.ri.$t,i,s))||function(t,i,s){if(0===t.zr)return  false;switch(t.ob){case "arrowDown":return tr(true,t._t,t.ut,t.zr,i,s);case "arrowUp":return tr(false,t._t,t.ut,t.zr,i,s);case "circle":return function(t,i,s,n,e){const r=2+Xe("circle",s)/2,h=t-n,a=i-e;return Math.sqrt(h*h+a*a)<=r}(t._t,t.ut,t.zr,i,s);case "square":return function(t,i,s,n,e){const r=Xe("square",s),h=(r-1)/2,a=t-h,l=i-h;return n>=a&&n<=a+r&&e>=l&&e<=l+r}(t._t,t.ut,t.zr,i,s)}}(t,i,s)}function er(t){return "atPriceTop"===t||"atPriceBottom"===t||"atPriceMiddle"===t}function rr(t,i,s,n,e,r,h,a){const l=function(t,i){if(er(i.position)&&void 0!==i.price)return i.price;if("value"in(s=t)&&"number"==typeof s.value)return t.value;var s;if(function(t){return "open"in t&&"high"in t&&"low"in t&&"close"in t}(t)){if("inBar"===i.position)return t.close;if("aboveBar"===i.position)return t.high;if("belowBar"===i.position)return t.low}}(s,i);if(void 0===l)return;const o=er(i.position),_=a.timeScale(),c=p(i.size)?Math.max(i.size,0):1,d=Ze(_.options().barSpacing)*c,f=d/2;t.zr=d;switch(i.position){case "inBar":case "atPriceMiddle":return t.ut=u(h.priceToCoordinate(l)),void(void 0!==t.ri&&(t.ri.ut=t.ut+f+r+.6*e));case "aboveBar":case "atPriceTop":{const i=o?0:n._b;return t.ut=u(h.priceToCoordinate(l))-f-i,void 0!==t.ri&&(t.ri.ut=t.ut-f-.6*e,n._b+=1.2*e),void(o||(n._b+=d+r))}case "belowBar":case "atPriceBottom":{const i=o?0:n.ub;return t.ut=u(h.priceToCoordinate(l))+f+i,void 0!==t.ri&&(t.ri.ut=t.ut+f+r+.6*e,n.ub+=1.2*e),void(o||(n.ub+=d+r))}}}class hr{constructor(t,i,s){this.cb=[],this.xt=true,this.fb=true,this.Gt=new ir,this.ge=t,this.Dp=i,this.Yt={ot:[],lt:null},this.Ps=s;}renderer(){if(!this.ge.options().visible)return null;this.xt&&this.pb();const t=this.Dp.options().layout;return this.Gt.Nn(t.fontSize,t.fontFamily,this.Ps.zOrder),this.Gt.ht(this.Yt),this.Gt}mb(t){this.cb=t,this.kt("data");}kt(t){this.xt=true,"data"===t&&(this.fb=true);}wb(t){this.xt=true,this.Ps=t;}zOrder(){return "aboveSeries"===this.Ps.zOrder?"top":this.Ps.zOrder}pb(){const t=this.Dp.timeScale(),i=this.cb;this.fb&&(this.Yt.ot=i.map((t=>({wt:t.time,_t:0,ut:0,zr:0,ob:t.shape,R:t.color,Kn:t.id,gb:t.gb,ri:void 0}))),this.fb=false);const s=this.Dp.options().layout;this.Yt.lt=null;const n=t.getVisibleLogicalRange();if(null===n)return;const e=new yi(Math.floor(n.from),Math.ceil(n.to));if(null===this.ge.data()[0])return;if(0===this.Yt.ot.length)return;let r=NaN;const h=Ge(t.options().barSpacing),a={_b:h,ub:h};this.Yt.lt=an(this.Yt.ot,e,true);for(let n=this.Yt.lt.from;n<this.Yt.lt.to;n++){const e=i[n];e.time!==r&&(a._b=h,a.ub=h,r=e.time);const l=this.Yt.ot[n];l._t=u(t.logicalToCoordinate(e.time)),void 0!==e.text&&e.text.length>0&&(l.ri={lb:e.text,_t:0,ut:0,Qi:0,$t:0});const o=this.ge.dataByIndex(e.time,0);null!==o&&rr(l,e,o,a,s.fontSize,h,this.ge,this.Dp);}this.xt=false;}}function ar(t){return {...je,...t}}class lr{constructor(t){this.sh=null,this.cb=[],this.Mb=[],this.bb=null,this.ge=null,this.Dp=null,this.Sb=true,this.xb=null,this.Cb=null,this.Pb=null,this.kb=true,this.Ps=ar(t);}attached(t){this.yb(),this.Dp=t.chart,this.ge=t.series,this.sh=new hr(this.ge,u(this.Dp),this.Ps),this.eb=t.requestUpdate,this.ge.subscribeDataChanged((t=>this.Pg(t))),this.kb=true,this.UM();}UM(){this.eb&&this.eb();}detached(){this.ge&&this.bb&&this.ge.unsubscribeDataChanged(this.bb),this.Dp=null,this.ge=null,this.sh=null,this.bb=null;}mb(t){this.kb=true,this.cb=t,this.yb(),this.Sb=true,this.Cb=null,this.UM();}Tb(){return this.cb}paneViews(){return this.sh?[this.sh]:[]}updateAllViews(){this.Rb();}hitTest(t,i){return this.sh?this.sh.renderer()?.jn(t,i)??null:null}autoscaleInfo(t,i){if(this.sh){const t=this.Db();if(t)return {priceRange:null,margins:t}}return null}hr(t){this.Ps=ar({...this.Ps,...t}),this.UM&&this.UM();}Db(){const t=u(this.Dp).timeScale().options().barSpacing;if(this.Sb||t!==this.Pb){if(this.Pb=t,this.cb.length>0){const i=Ge(t),s=1.5*Ze(t)+2*i,n=this.Vb();this.xb={above:Je(s,n.aboveBar,n.inBar),below:Je(s,n.belowBar,n.inBar)};}else this.xb=null;this.Sb=false;}return this.xb}Vb(){return null===this.Cb&&(this.Cb=this.cb.reduce(((t,i)=>(t[i.position]||(t[i.position]=true),t)),{inBar:false,aboveBar:false,belowBar:false,atPriceTop:false,atPriceBottom:false,atPriceMiddle:false})),this.Cb}yb(){if(!this.kb||!this.Dp||!this.ge)return;const t=this.Dp.timeScale(),i=this.ge?.data();if(null==t.getVisibleLogicalRange()||!this.ge||0===i.length)return void(this.Mb=[]);const s=t.timeToIndex(u(i[0].time),true);this.Mb=this.cb.map(((i,n)=>{const e=t.timeToIndex(i.time,true),r=e<s?1:-1,h=u(this.ge).dataByIndex(e,r),a={time:t.timeToIndex(u(h).time,false),position:i.position,shape:i.shape,color:i.color,id:i.id,gb:n,text:i.text,size:i.size,price:i.price,Pw:i.time};if("atPriceTop"===i.position||"atPriceBottom"===i.position||"atPriceMiddle"===i.position){if(void 0===i.price)throw new Error(`Price is required for position ${i.position}`);return {...a,position:i.position,price:i.price}}return {...a,position:i.position,price:i.price}})),this.kb=false;}Rb(t){this.sh&&(this.yb(),this.sh.mb(this.Mb),this.sh.wb(this.Ps),this.sh.kt(t));}Pg(t){this.kb=true,this.UM();}}class or extends Ye{constructor(t,i,s){super(t,i),s&&this.setMarkers(s);}setMarkers(t){this.ah.mb(t);}markers(){return this.ah.Tb()}}function _r(t,i,s){const n=new or(t,new lr({}));return i&&n.setMarkers(i),n}const Mr={...e,color:"#2196f3"};

function optimalCandlestickWidth(barSpacing, pixelRatio) {
  const barSpacingSpecialCaseFrom = 2.5;
  const barSpacingSpecialCaseTo = 4;
  const barSpacingSpecialCaseCoeff = 3;
  if (barSpacing >= barSpacingSpecialCaseFrom && barSpacing <= barSpacingSpecialCaseTo) {
    return Math.floor(barSpacingSpecialCaseCoeff * pixelRatio);
  }
  const barSpacingReducingCoeff = 0.2;
  const coeff = 1 - barSpacingReducingCoeff * Math.atan(Math.max(barSpacingSpecialCaseTo, barSpacing) - barSpacingSpecialCaseTo) / (Math.PI * 0.5);
  const res = Math.floor(barSpacing * coeff * pixelRatio);
  const scaledBarSpacing = Math.floor(barSpacing * pixelRatio);
  const optimal = Math.min(res, scaledBarSpacing);
  return Math.max(Math.floor(pixelRatio), optimal);
}
function candlestickWidth(barSpacing, horizontalPixelRatio) {
  let width = optimalCandlestickWidth(barSpacing, horizontalPixelRatio);
  if (width >= 2) {
    const wickWidth = Math.floor(horizontalPixelRatio);
    if (wickWidth % 2 !== width % 2) {
      width--;
    }
  }
  return width;
}

function gridAndCrosshairBitmapWidth(horizontalPixelRatio) {
  return Math.max(1, Math.floor(horizontalPixelRatio));
}
function gridAndCrosshairMediaWidth(horizontalPixelRatio) {
  return gridAndCrosshairBitmapWidth(horizontalPixelRatio) / horizontalPixelRatio;
}

function centreOffset(lineBitmapWidth) {
  return Math.floor(lineBitmapWidth * 0.5);
}
function positionsLine(positionMedia, pixelRatio, desiredWidthMedia = 1, widthIsBitmap) {
  const scaledPosition = Math.round(pixelRatio * positionMedia);
  const lineBitmapWidth = Math.round(desiredWidthMedia * pixelRatio);
  const offset = centreOffset(lineBitmapWidth);
  const position = scaledPosition - offset;
  return {
    position,
    length: lineBitmapWidth
  };
}
function positionsBox(position1Media, position2Media, pixelRatio) {
  const scaledPosition1 = Math.round(pixelRatio * position1Media);
  const scaledPosition2 = Math.round(pixelRatio * position2Media);
  return {
    position: Math.min(scaledPosition1, scaledPosition2),
    length: Math.abs(scaledPosition2 - scaledPosition1) + 1
  };
}

class RoundedCandleSeriesRenderer {
  _data = null;
  _options = null;
  draw(target, priceConverter) {
    target.useBitmapCoordinateSpace(scope => this._drawImpl(scope, priceConverter));
  }
  update(data, options) {
    this._data = data;
    this._options = options;
  }
  _drawImpl(renderingScope, priceToCoordinate) {
    if (this._data === null || this._data.bars.length === 0 || this._data.visibleRange === null || this._options === null) {
      return;
    }
    const start = this._data.visibleRange.from;
    const end = this._data.visibleRange.to;
    const vis_bars = this._data.bars.slice(start, end).map(bar => {
      const isUp = bar.originalData.close >= bar.originalData.open;
      const openY = priceToCoordinate(bar.originalData.open) ?? 0;
      const highY = priceToCoordinate(bar.originalData.high) ?? 0;
      const lowY = priceToCoordinate(bar.originalData.low) ?? 0;
      const closeY = priceToCoordinate(bar.originalData.close) ?? 0;
      return {
        openY,
        highY,
        lowY,
        closeY,
        x: bar.x,
        isUp
      };
    });
    if (this._options.priceLineColor !== "") {
      this._options.color = this._options.priceLineColor;
    } else {
      let last_bar = this._data.bars.at(-1);
      let lastIsUp = last_bar ? last_bar.originalData.close >= last_bar.originalData.open : false;
      this._options.color = lastIsUp ? this._options.upColor : this._options.downColor;
    }
    const radius = this._options.radius(this._data.barSpacing);
    if (this._options.wickVisible) this._drawWicks(renderingScope, vis_bars);
    this._drawCandles(renderingScope, vis_bars, radius);
  }
  _drawWicks(renderingScope, bars) {
    if (this._data === null || this._options === null) {
      return;
    }
    const {
      context: ctx,
      horizontalPixelRatio,
      verticalPixelRatio
    } = renderingScope;
    const wickWidth = gridAndCrosshairMediaWidth(horizontalPixelRatio);
    for (const bar of bars) {
      ctx.fillStyle = bar.isUp ? this._options.wickUpColor : this._options.wickDownColor;
      const verticalPositions = positionsBox(bar.lowY, bar.highY, verticalPixelRatio);
      const linePositions = positionsLine(bar.x, horizontalPixelRatio, wickWidth);
      ctx.fillRect(linePositions.position, verticalPositions.position, linePositions.length, verticalPositions.length);
    }
  }
  _drawCandles(renderingScope, bars, radius) {
    if (this._data === null || this._options === null) {
      return;
    }
    const {
      context: ctx,
      horizontalPixelRatio,
      verticalPixelRatio
    } = renderingScope;
    const candleBodyWidth = candlestickWidth(this._data.barSpacing, 1);
    for (const bar of bars) {
      const verticalPositions = positionsBox(Math.min(bar.openY, bar.closeY), Math.max(bar.openY, bar.closeY), verticalPixelRatio);
      const linePositions = positionsLine(bar.x, horizontalPixelRatio, candleBodyWidth);
      ctx.fillStyle = bar.isUp ? this._options.upColor : this._options.downColor;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(linePositions.position, verticalPositions.position, linePositions.length, verticalPositions.length, radius);
        ctx.fill();
      } else {
        ctx.fillRect(linePositions.position, verticalPositions.position, linePositions.length, verticalPositions.length);
      }
    }
  }
}

const defaultOptions$2 = {
  ...Mr,
  upColor: "#26a69a",
  downColor: "#ef5350",
  wickVisible: true,
  wickColor: "#737375",
  wickUpColor: "#26a69a",
  wickDownColor: "#ef5350",
  radius: function (bs) {
    if (bs < 4) return 0;
    return bs / 3;
  }
};
class RoundedCandleSeriesImpl {
  _renderer;
  constructor() {
    this._renderer = new RoundedCandleSeriesRenderer();
  }
  priceValueBuilder(plotRow) {
    return [plotRow.high, plotRow.low, plotRow.close];
  }
  renderer() {
    return this._renderer;
  }
  isWhitespace(data) {
    return data.close === void 0;
  }
  update(data, options) {
    this._renderer.update(data, options);
  }
  defaultOptions() {
    return defaultOptions$2;
  }
}
function RoundedCandleHitTest(params, data) {
  const localY = params.sourceEvent?.localY;
  if (localY === void 0 || !data) return false;
  const high = this.priceToCoordinate(data.high);
  const low = this.priceToCoordinate(data.low);
  return (high && low && high <= localY && low >= localY) ?? false;
}

var Series_Type = /* @__PURE__ */(Series_Type2 => {
  Series_Type2[Series_Type2["WhitespaceData"] = 0] = "WhitespaceData";
  Series_Type2[Series_Type2["SingleValueData"] = 1] = "SingleValueData";
  Series_Type2[Series_Type2["LINE"] = 2] = "LINE";
  Series_Type2[Series_Type2["AREA"] = 3] = "AREA";
  Series_Type2[Series_Type2["BASELINE"] = 4] = "BASELINE";
  Series_Type2[Series_Type2["HISTOGRAM"] = 5] = "HISTOGRAM";
  Series_Type2[Series_Type2["OHLC"] = 6] = "OHLC";
  Series_Type2[Series_Type2["BAR"] = 7] = "BAR";
  Series_Type2[Series_Type2["CANDLESTICK"] = 8] = "CANDLESTICK";
  Series_Type2[Series_Type2["ROUNDED_CANDLE"] = 9] = "ROUNDED_CANDLE";
  return Series_Type2;
})(Series_Type || {});
const SERIES_NAME_MAP = /* @__PURE__ */new Map([[0 /* WhitespaceData */, "Whitespace"], [1 /* SingleValueData */, "Single-Value"], [2 /* LINE */, "Line"], [3 /* AREA */, "Area"], [4 /* BASELINE */, "Baseline"], [5 /* HISTOGRAM */, "Histogram"], [6 /* OHLC */, "OHLC"], [7 /* BAR */, "Bar"], [8 /* CANDLESTICK */, "Candlestick"],
// [Series_Type.HLC_AREA:'High-Low Area'],
[9 /* ROUNDED_CANDLE */, "Rounded-Candle"]]);
const SERIES_TYPE_MAP = /* @__PURE__ */new Map([[0 /* WhitespaceData */, Jn], [1 /* SingleValueData */, Jn], [2 /* LINE */, Jn], [3 /* AREA */, me], [4 /* BASELINE */, fe], [5 /* HISTOGRAM */, ye], [7 /* BAR */, be], [6 /* OHLC */, Ce], [8 /* CANDLESTICK */, Ce]]);
const NULL_HIT = () => false;
const SERIES_HIT_TEST_MAP = /* @__PURE__ */new Map([
// Built-In Series Types
[2 /* LINE */, LineHitTest], [3 /* AREA */, LineHitTest], [5 /* HISTOGRAM */, HistogramHitTest], [7 /* BAR */, CandleHitTest], [6 /* OHLC */, CandleHitTest], [8 /* CANDLESTICK */, CandleHitTest],
// Custom Series Types
[9 /* ROUNDED_CANDLE */, RoundedCandleHitTest]]);
class SeriesBase {
  [ORDERABLE] = true;
  _series;
  _indicator;
  _id;
  _type;
  _name;
  hitTest;
  _markers;
  _markersPlugin;
  _pricelines;
  shortcuts;
  ctxMenuStruct;
  leafProps;
  constructor(id, displayName, type, _indicator) {
    this._id = id;
    this._type = type;
    this._indicator = _indicator;
    this._name = displayName;
    this._series = this._createSeries(type);
    this.hitTest = SERIES_HIT_TEST_MAP.get(type)?.bind(this) ?? NULL_HIT;
    console.log(this);
    this.leafProps = {
      id: this.id,
      leafTitle: this.name,
      obj: this
    };
  }
  _createSeries(series_type) {
    let _lwc_type = SERIES_TYPE_MAP.get(series_type);
    let new_series;
    if (_lwc_type) new_series = this.pane._addSeries(_lwc_type);else switch (series_type) {
      case 9 /* ROUNDED_CANDLE */:
        new_series = this.pane._addCustomSeries(new RoundedCandleSeriesImpl());
        break;
    }
    if (!new_series) throw TypeError(`Unknown Series Type: ${series_type}`);
    new_series.Jn.seriesBase = this;
    return new_series;
  }
  get id() {
    return this._id;
  }
  get indicator() {
    return this._indicator;
  }
  get index() {
    return this._series.seriesOrder();
  }
  get paneIndex() {
    return this._indicator.pane.paneIndex;
  }
  get name() {
    return this._name ? this._name : SERIES_NAME_MAP.get(this._type) ?? "";
  }
  get pane() {
    return this._indicator.pane;
  }
  get frame() {
    return this._indicator.frame;
  }
  get chart() {
    return this._indicator.frame._chart;
  }
  onActivation() {
    console.log("activate series", this._type);
    if (this.shortcuts) KeyboardCTX().attachHandler(this.id, this.shortcuts);
  }
  onDeactivation() {
    console.log("deactivate series", this._type);
    KeyboardCTX().detachHandler(this.id);
  }
  remove() {
    this.chart.removeSeries(this._series);
  }
  update(bar) {
    this._series.update(bar);
  }
  setData(data) {
    this._series.setData(data);
  }
  /* Changes the type of series that is displayed. Data must be given since the DataType may change */
  change_series_type(series_type, data) {
    if (series_type === this._type) return;
    const current_zindex = this._series.seriesOrder();
    const current_range = this.chart.timeScale().getVisibleRange();
    this.remove();
    this._series = this._createSeries(series_type);
    this._series.setData(data);
    this._type = series_type;
    this._series.setSeriesOrder(current_zindex);
    if (current_range !== null) this.chart.timeScale().setVisibleRange(current_range);
    this.hitTest = SERIES_HIT_TEST_MAP.get(this._type)?.bind(this) ?? NULL_HIT;
  }
  applyOptions(options, externalCall = false) {
    this._series.applyOptions(options);
    if (!externalCall) {
      window.api.update_series_options(this.indicator.frame.id.substring(0, 6),
      // Container ID only
      this.indicator.frame.id, this.indicator.id, this.id, options);
    }
  }
  // #region ---- ---- lightweight-chart ISeriesAPI functions ---- ----
  priceScale() {
    return this._series.priceScale();
  }
  options() {
    return this._series.options();
  }
  // data() may not work as intended. Extra data parameters are deleted on setData()
  // e.g. High/Low/Close/Open values passed to a line series are deleted. Only 'time', 'value', and 'customValues' are kept.
  data() {
    return this._series.data();
  }
  dataByIndex(logicalIndex, mismatchDirection) {
    return this._series.dataByIndex(logicalIndex, mismatchDirection);
  }
  barsInLogicalRange(range) {
    return this._series.barsInLogicalRange(range);
  }
  priceFormatter() {
    return this._series.priceFormatter();
  }
  priceToCoordinate(price) {
    return this._series.priceToCoordinate(price);
  }
  coordinateToPrice(coordinate) {
    return this._series.coordinateToPrice(coordinate);
  }
  // #endregion
  // #region ---- ---- MouseEvent Functions ---- ----
  // To be Implemented Mouse Events for Series Types
  _onClick(param) {}
  _onAuxClick(param) {}
  _onDblClick(param) {}
  _onMouseUp(param) {}
  _onMouseDown(param) {}
  fireClickEvent(event, e) {
    switch (event) {
      case "click":
        this._onClick?.(e);
        break;
      case "auxclick":
        this._onAuxClick?.(e);
        break;
      case "dblclick":
        this._onDblClick?.(e);
        break;
      case "mouseup":
        this._onMouseUp?.(e);
        break;
      case "mousedown":
        this._onMouseDown?.(e);
        break;
    }
  }
  //#endregion
  // #region ---- ---- Markers Functions ---- ----
  get markers() {
    if (this._markers === void 0) this._markers = /* @__PURE__ */new Map();
    return this._markers;
  }
  get markersPlugin() {
    if (this._markersPlugin === void 0) this._markersPlugin = _r(this._series, []);
    return this._markersPlugin;
  }
  _updateMarkersPlugin() {
    this.markersPlugin.setMarkers(Array.from(this.markers.values()));
  }
  setMarkersOptions(opts) {
    this.markersPlugin.applyOptions?.(opts);
  }
  setMarkers(markers) {
    delete this._markers;
    this._markers = new Map(Object.entries(markers));
    this._updateMarkersPlugin();
  }
  updateMarker(mark_id, mark) {
    this.markers.set(mark_id, mark);
    this._updateMarkersPlugin();
  }
  removeMarker(mark_id) {
    if (this._markers === void 0) return;
    if (this.markers.delete(mark_id)) this._updateMarkersPlugin();
  }
  filterMarkers(_ids) {
    if (this._markers === void 0) return;
    _ids.forEach(id => this.markers.delete(id));
    this._updateMarkersPlugin();
  }
  removeAllMarkers() {
    delete this._markers;
    this._markers = /* @__PURE__ */new Map();
    this._updateMarkersPlugin();
  }
  //#endregion
  // #region ---- ---- Priceline Functions ---- ----
  get pricelines() {
    if (this._pricelines == void 0) this._pricelines = /* @__PURE__ */new Map();
    return this._pricelines;
  }
  createPriceLine(id, options) {
    this.pricelines.set(id, this._series.createPriceLine(options));
  }
  removePriceLine(line_id) {
    let line = this.pricelines.get(line_id);
    if (line !== void 0) {
      this._series.removePriceLine(line);
      this.pricelines.delete(line_id);
    }
  }
  updatePriceLine(line_id, options) {
    let line = this.pricelines.get(line_id);
    if (line !== void 0) line.applyOptions(options);
  }
  filterPriceLines(_ids) {
    _ids.forEach(this.removePriceLine.bind(this));
  }
  removeAllPriceLines() {
    if (this._pricelines == void 0) return;
    this._series.Jn.bh = [];
    delete this._pricelines;
  }
  //#endregion
}
function LineHitTest(params, data) {
  const localY = params.sourceEvent?.localY;
  if (localY === void 0 || !data) return false;
  const value = this.priceToCoordinate(data[0]);
  return (value && Math.abs(value - localY) <= 10) ?? false;
}
function HistogramHitTest(params, data) {
  const localY = params.sourceEvent?.localY;
  if (localY === void 0 || !data) return false;
  const value = this.priceToCoordinate(data[0]);
  if (this.priceScale().options().invertScale) return (value && localY < value) ?? false;else return (value && localY > value) ?? false;
}
function CandleHitTest(params, data) {
  const localY = params.sourceEvent?.localY;
  if (localY === void 0 || !data) return false;
  const high = this.priceToCoordinate(data[1]);
  const low = this.priceToCoordinate(data[2]);
  return (high && low && high <= localY && low >= localY) ?? false;
}

var _tmpl$$g = /* @__PURE__ */template(`<div class=form_wrapper><div class=footer><input type=submit value=Apply>`),
  _tmpl$2$b = /* @__PURE__ */template(`<form class=style_form><div class=series_style_selector>`),
  _tmpl$3$5 = /* @__PURE__ */template(`<div class=style_selector_row>`),
  _tmpl$4$5 = /* @__PURE__ */template(`<div class=style_selector_row><label for=invertFilledArea></label><label for=topColor></label><label for=bottomColor>`),
  _tmpl$5$5 = /* @__PURE__ */template(`<div class=style_selector_row><label for=base></label><input id=base type=number><label for=color>`),
  _tmpl$6$4 = /* @__PURE__ */template(`<div class=style_selector_row><label for=baseValue></label><input id=baseValue type=number>`),
  _tmpl$7$4 = /* @__PURE__ */template(`<div class=style_selector_row><label for=topLineColor></label><label for=topFillColor1></label><label for=topFillColor2>`),
  _tmpl$8$2 = /* @__PURE__ */template(`<div class=style_selector_row><label for=bottomLineColor></label><label for=bottomFillColor1></label><label for=bottomFillColor2>`),
  _tmpl$9$2 = /* @__PURE__ */template(`<div class=style_selector_row><label for=lineVisible>`),
  _tmpl$0$1 = /* @__PURE__ */template(`<div class=style_selector_row><label for=thinBars></label><label for=openVisible></label><span></span> `),
  _tmpl$1$1 = /* @__PURE__ */template(`<span class=tooltip><span class=tooltiptext></span><input type=checkbox>`),
  _tmpl$10$1 = /* @__PURE__ */template(`<div class=style_selector_row><label for=visible></label><span class=opts-select><label>`),
  _tmpl$11$1 = /* @__PURE__ */template(`<div class=style_selector_row><label>`),
  _tmpl$12$1 = /* @__PURE__ */template(`<div class=style_selector_row><label for=lastValueVisible></label><input type=text id=title>`),
  _tmpl$13 = /* @__PURE__ */template(`<div class=style_selector_row><label for=priceLineVisible>`),
  _tmpl$14 = /* @__PURE__ */template(`<div class=style_selector_row><label for=pointMarkersVisible></label><label for=pointMarkersRadius>`),
  _tmpl$15 = /* @__PURE__ */template(`<div class=style_selector_row><label for=crosshairMarkerVisible></label><label for=crosshairMarkerRadius></label><label for=crosshairMarkerBorderWidth>`),
  _tmpl$16 = /* @__PURE__ */template(`<div class=style_selector_row><label></label><span></span><label for=upColor></label><label for=downColor>`),
  _tmpl$17 = /* @__PURE__ */template(`<div class=style_selector_row><label for=wickVisible></label><span></span><label for=wickUpColor></label><label for=wickDownColor>`),
  _tmpl$18 = /* @__PURE__ */template(`<div class=style_selector_row><label for=borderVisible></label><span></span><label for=borderUpColor></label><label for=borderDownColor>`),
  _tmpl$19 = /* @__PURE__ */template(`<input type=checkbox>`),
  _tmpl$20 = /* @__PURE__ */template(`<input type=number step=any min=1 max=10>`),
  _tmpl$21 = /* @__PURE__ */template(`<span class=select-span><select>`),
  _tmpl$22 = /* @__PURE__ */template(`<option>`);
function MultipleSeriesStyleEditor(props) {
  let forms_wrapper = document.createElement("div");
  const submitAll = () => {
    forms_wrapper.querySelectorAll("form").forEach(form => form.requestSubmit());
  };
  return (() => {
    var _el$ = _tmpl$$g(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild;
    var _ref$ = forms_wrapper;
    typeof _ref$ === "function" ? use(_ref$, _el$) : forms_wrapper = _el$;
    insert(_el$, createComponent(For, {
      get each() {
        return Array.from(props.series.entries());
      },
      children: ([_id, type], i) => {
        let series = props.series.get(_id);
        if (series === void 0) return;
        return createComponent(SeriesStyleEditor, {
          series,
          get name() {
            return series._name ?? `Series #${i() + 1}`;
          }
        });
      }
    }), _el$2);
    _el$3.$$click = submitAll;
    return _el$;
  })();
}
function SeriesStyleEditor(props) {
  let form = document.createElement("form");
  const [options, setOptions] = createSignal(props.series.options());
  let s_type = props.series._type;
  const LineType2 = s_type === Series_Type.LINE || s_type === Series_Type.AREA || s_type === Series_Type.BASELINE;
  let signals = {
    // baseline: createSignal(false),  //SeriesCommon
    priceline: createSignal(false),
    //SeriesCommon
    markers: LineType2 ? createSignal(false) : void 0,
    crosshair: LineType2 ? createSignal(false) : void 0
  };
  createEffect(on$1(
  //Next Line pulls out all the valid Accessors from the signals object
  Object.values(signals).map(v => v ? v[0] : void 0).filter(v => v !== void 0), () => setOptions(props.series.options())));
  const editor_props = {
    submit: () => form.requestSubmit(),
    ...signals
  };
  return (() => {
    var _el$4 = _tmpl$2$b(),
      _el$5 = _el$4.firstChild;
    addEventListener(_el$4, "submit", onSubmit.bind(void 0, props.series));
    var _ref$2 = form;
    typeof _ref$2 === "function" ? use(_ref$2, _el$4) : form = _el$4;
    insert(_el$5, createComponent(TitleBar$1, {
      get name() {
        return props.name;
      },
      get visible() {
        return options().visible;
      },
      get submit() {
        return editor_props.submit;
      },
      signals
    }), null);
    insert(_el$5, createComponent(Switch, {
      get children() {
        return [createComponent(Match, {
          get when() {
            return props.series._type === Series_Type.LINE;
          },
          get children() {
            return createComponent(LineEditor, mergeProps({
              get opts() {
                return options();
              }
            }, editor_props));
          }
        }), createComponent(Match, {
          get when() {
            return props.series._type === Series_Type.AREA;
          },
          get children() {
            return createComponent(AreaEditor, mergeProps({
              get opts() {
                return options();
              }
            }, editor_props));
          }
        }), createComponent(Match, {
          get when() {
            return props.series._type === Series_Type.HISTOGRAM;
          },
          get children() {
            return createComponent(HistogramEditor, mergeProps({
              get opts() {
                return options();
              }
            }, editor_props));
          }
        }), createComponent(Match, {
          get when() {
            return props.series._type === Series_Type.BASELINE;
          },
          get children() {
            return createComponent(BaseLineEditor, mergeProps({
              get opts() {
                return options();
              }
            }, editor_props));
          }
        }), createComponent(Match, {
          get when() {
            return props.series._type === Series_Type.BAR;
          },
          get children() {
            return createComponent(BarEditor, mergeProps({
              get opts() {
                return options();
              }
            }, editor_props));
          }
        }), createComponent(Match, {
          get when() {
            return props.series._type === Series_Type.CANDLESTICK;
          },
          get children() {
            return createComponent(CandleEditor, mergeProps({
              get opts() {
                return options();
              }
            }, editor_props));
          }
        }), createComponent(Match, {
          get when() {
            return props.series._type === Series_Type.ROUNDED_CANDLE;
          },
          get children() {
            return createComponent(RndCandleEditor, mergeProps({
              get opts() {
                return options();
              }
            }, editor_props));
          }
        })];
      }
    }), null);
    insert(_el$5, createComponent(SeriesCommon, {
      get show_price_line() {
        return signals.priceline?.[0]() ?? false;
      },
      get submit() {
        return editor_props.submit;
      },
      get options() {
        return options();
      }
    }), null);
    return _el$4;
  })();
}
function onSubmit(series, e) {
  e.preventDefault();
  if (e.target !== null) {
    let nodes = Array.from(e.target.querySelectorAll("input, select"));
    nodes = nodes.filter(node => node.id !== "");
    series.applyOptions(Object.fromEntries(Array.from(nodes, node => {
      switch (node.getAttribute("type")) {
        case "checkbox":
          return [node.id, node.checked];
        case null:
          return [node.id, parseInt(node.value)];
        case "number":
          if (node.id === "baseValue") return [node.id, {
            "type": "price",
            "price": parseFloat(node.value)
          }];else return [node.id, parseFloat(node.value)];
        case "color_picker":
          return [node.id, node.value === "#00000000" ? "" : node.value];
        default:
          return [node.id, node.value];
      }
    })));
  }
}
function LineEditor(props) {
  return [createComponent(PlotLine, {
    keys: ["Plot Line: ", "lineVisible", "color", "lineWidth", "lineStyle", "lineType"],
    get vis() {
      return props.opts.lineVisible;
    },
    get color() {
      return props.opts.color;
    },
    get width() {
      return props.opts.lineWidth;
    },
    get style() {
      return props.opts.lineStyle;
    },
    get type() {
      return props.opts.lineType;
    },
    get submit() {
      return props.submit;
    }
  }), createComponent(Markers, {
    get show_adv() {
      return props.markers?.[0]() ?? false;
    },
    get submit() {
      return props.submit;
    },
    get options() {
      return props.opts;
    }
  }), createComponent(Crosshair, {
    get show_adv() {
      return props.crosshair?.[0]() ?? false;
    },
    get submit() {
      return props.submit;
    },
    get options() {
      return props.opts;
    }
  })];
}
function AreaEditor(props) {
  return [(() => {
    var _el$6 = _tmpl$3$5();
    _el$6.innerText = "Area Series";
    return _el$6;
  })(), createComponent(PlotLine, {
    keys: ["Line: ", "lineVisible", "lineColor", "lineWidth", "lineStyle", "lineType"],
    get vis() {
      return props.opts.lineVisible;
    },
    get color() {
      return props.opts.lineColor;
    },
    get width() {
      return props.opts.lineWidth;
    },
    get style() {
      return props.opts.lineStyle;
    },
    get type() {
      return props.opts.lineType;
    },
    get submit() {
      return props.submit;
    }
  }), (() => {
    var _el$7 = _tmpl$4$5(),
      _el$8 = _el$7.firstChild,
      _el$9 = _el$8.nextSibling,
      _el$0 = _el$9.nextSibling;
    _el$8.innerText = "Invert: ";
    insert(_el$7, createComponent(Checkbox, {
      key: "invertFilledArea",
      get checked() {
        return props.opts.invertFilledArea;
      },
      get submit() {
        return props.submit;
      }
    }), _el$9);
    _el$9.innerText = "Top Color: ";
    insert(_el$7, createComponent(ColorInputWrapper, {
      key: "topColor",
      get ["default"]() {
        return props.opts.topColor;
      },
      get submit() {
        return props.submit;
      }
    }), _el$0);
    _el$0.innerText = "Bottom Color: ";
    insert(_el$7, createComponent(ColorInputWrapper, {
      key: "bottomColor",
      get ["default"]() {
        return props.opts.bottomColor;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    return _el$7;
  })(), createComponent(Markers, {
    get show_adv() {
      return props.markers?.[0]() ?? false;
    },
    get submit() {
      return props.submit;
    },
    get options() {
      return props.opts;
    }
  }), createComponent(Crosshair, {
    get show_adv() {
      return props.crosshair?.[0]() ?? false;
    },
    get submit() {
      return props.submit;
    },
    get options() {
      return props.opts;
    }
  })];
}
function HistogramEditor(props) {
  return (() => {
    var _el$1 = _tmpl$5$5(),
      _el$10 = _el$1.firstChild,
      _el$11 = _el$10.nextSibling,
      _el$12 = _el$11.nextSibling;
    _el$10.innerText = "Base Value: ";
    addEventListener(_el$11, "input", props.submit, true);
    _el$11.style.setProperty("width", "auto");
    _el$12.innerText = "Color: ";
    _el$12.style.setProperty("margin-left", "18px");
    insert(_el$1, createComponent(ColorInputWrapper, {
      key: "color",
      get ["default"]() {
        return props.opts.color;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    createRenderEffect(() => _el$11.value = props.opts.base);
    return _el$1;
  })();
}
function BaseLineEditor(props) {
  return [(() => {
    var _el$13 = _tmpl$6$4(),
      _el$14 = _el$13.firstChild,
      _el$15 = _el$14.nextSibling;
    _el$14.innerText = "Base Price: ";
    addEventListener(_el$15, "input", props.submit, true);
    _el$15.style.setProperty("width", "auto");
    createRenderEffect(() => _el$15.value = props.opts.baseValue.price);
    return _el$13;
  })(), (() => {
    var _el$16 = _tmpl$7$4(),
      _el$17 = _el$16.firstChild,
      _el$18 = _el$17.nextSibling,
      _el$19 = _el$18.nextSibling;
    _el$17.innerText = "Top Line:";
    _el$17.style.setProperty("margin-right", "27px");
    insert(_el$16, createComponent(ColorInputWrapper, {
      key: "topLineColor",
      get ["default"]() {
        return props.opts.topLineColor;
      },
      get submit() {
        return props.submit;
      }
    }), _el$18);
    _el$18.innerText = "Fill 1:";
    _el$18.style.setProperty("margin-left", "12px");
    insert(_el$16, createComponent(ColorInputWrapper, {
      key: "topFillColor1",
      get ["default"]() {
        return props.opts.topFillColor1;
      },
      get submit() {
        return props.submit;
      }
    }), _el$19);
    _el$19.innerText = "Fill 2:";
    _el$19.style.setProperty("margin-left", "12px");
    insert(_el$16, createComponent(ColorInputWrapper, {
      key: "topFillColor2",
      get ["default"]() {
        return props.opts.topFillColor2;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    return _el$16;
  })(), (() => {
    var _el$20 = _tmpl$8$2(),
      _el$21 = _el$20.firstChild,
      _el$22 = _el$21.nextSibling,
      _el$23 = _el$22.nextSibling;
    _el$21.innerText = "Bottom Line: ";
    insert(_el$20, createComponent(ColorInputWrapper, {
      key: "bottomLineColor",
      get ["default"]() {
        return props.opts.bottomLineColor;
      },
      get submit() {
        return props.submit;
      }
    }), _el$22);
    _el$22.innerText = "Fill 1:";
    _el$22.style.setProperty("margin-left", "12px");
    insert(_el$20, createComponent(ColorInputWrapper, {
      key: "bottomFillColor1",
      get ["default"]() {
        return props.opts.bottomFillColor1;
      },
      get submit() {
        return props.submit;
      }
    }), _el$23);
    _el$23.innerText = "Fill 2:";
    _el$23.style.setProperty("margin-left", "12px");
    insert(_el$20, createComponent(ColorInputWrapper, {
      key: "bottomFillColor2",
      get ["default"]() {
        return props.opts.bottomFillColor2;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    return _el$20;
  })(), (() => {
    var _el$24 = _tmpl$9$2(),
      _el$25 = _el$24.firstChild;
    _el$25.innerText = "Line: ";
    insert(_el$24, createComponent(Checkbox, {
      key: "lineVisible",
      get checked() {
        return props.opts.lineVisible;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    insert(_el$24, createComponent(LineWidthPicker, {
      key: "lineWidth",
      get ["default"]() {
        return props.opts.lineWidth;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    insert(_el$24, createComponent(LineTypePicker, {
      key: "lineType",
      get ["default"]() {
        return props.opts.lineType;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    insert(_el$24, createComponent(LineStylePicker, {
      key: "lineStyle",
      get ["default"]() {
        return props.opts.lineStyle;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    return _el$24;
  })(), createComponent(Markers, {
    get show_adv() {
      return props.markers?.[0]() ?? false;
    },
    get submit() {
      return props.submit;
    },
    get options() {
      return props.opts;
    }
  }), createComponent(Crosshair, {
    get show_adv() {
      return props.crosshair?.[0]() ?? false;
    },
    get submit() {
      return props.submit;
    },
    get options() {
      return props.opts;
    }
  })];
}
function BarEditor(props) {
  return [(() => {
    var _el$26 = _tmpl$0$1(),
      _el$27 = _el$26.firstChild,
      _el$28 = _el$27.nextSibling,
      _el$29 = _el$28.nextSibling;
    _el$27.innerText = "Thin Bars: ";
    insert(_el$26, createComponent(Checkbox, {
      key: "thinBars",
      get checked() {
        return props.opts.thinBars;
      },
      get submit() {
        return props.submit;
      }
    }), _el$28);
    _el$28.innerText = "Show Open:";
    _el$28.style.setProperty("margin-left", "12px");
    insert(_el$26, createComponent(Checkbox, {
      key: "openVisible",
      get checked() {
        return props.opts.openVisible;
      },
      get submit() {
        return props.submit;
      }
    }), _el$29);
    return _el$26;
  })(), createComponent(BarColor, {
    get submit() {
      return props.submit;
    },
    get opts() {
      return props.opts;
    }
  })];
}
function CandleEditor(props) {
  return [createComponent(BarColor, {
    get submit() {
      return props.submit;
    },
    get opts() {
      return props.opts;
    }
  }), createComponent(BarWick, {
    get submit() {
      return props.submit;
    },
    get opts() {
      return props.opts;
    }
  }), createComponent(BarBorder, {
    get submit() {
      return props.submit;
    },
    get opts() {
      return props.opts;
    }
  })];
}
function RndCandleEditor(props) {
  return [createComponent(BarColor, {
    get submit() {
      return props.submit;
    },
    get opts() {
      return props.opts;
    }
  }), createComponent(BarWick, {
    get submit() {
      return props.submit;
    },
    get opts() {
      return props.opts;
    }
  })];
}
function SettingsToggle(props) {
  return createComponent(Show, {
    get when() {
      return props.signal;
    },
    get children() {
      var _el$30 = _tmpl$1$1(),
        _el$31 = _el$30.firstChild,
        _el$32 = _el$31.nextSibling;
      _el$32.$$input = e => props.signal?.[1](e.target.checked);
      createRenderEffect(() => _el$31.innerText = props.tip);
      createRenderEffect(() => _el$32.checked = props.signal?.[0]());
      return _el$30;
    }
  });
}
function TitleBar$1(props) {
  return (() => {
    var _el$33 = _tmpl$10$1(),
      _el$34 = _el$33.firstChild,
      _el$35 = _el$34.nextSibling,
      _el$36 = _el$35.firstChild;
    insert(_el$33, createComponent(Checkbox, {
      key: "visible",
      get checked() {
        return props.visible;
      },
      get submit() {
        return props.submit;
      }
    }), _el$35);
    insert(_el$35, createComponent(SettingsToggle, {
      get signal() {
        return props.signals.priceline;
      },
      tip: "Price Line & Label"
    }), _el$36);
    insert(_el$35, createComponent(SettingsToggle, {
      get signal() {
        return props.signals.crosshair;
      },
      tip: "Crosshair Marker"
    }), _el$36);
    insert(_el$35, createComponent(SettingsToggle, {
      get signal() {
        return props.signals.markers;
      },
      tip: "Data Markers"
    }), _el$36);
    _el$36.innerText = "Adv. Opts:";
    createRenderEffect(() => _el$34.innerText = props.name);
    return _el$33;
  })();
}
function SeriesCommon(props) {
  return [createComponent(PriceLine, {
    get visible() {
      return props.options.priceLineVisible;
    },
    get color() {
      return props.options.priceLineColor;
    },
    get width() {
      return props.options.priceLineWidth;
    },
    get style() {
      return props.options.priceLineStyle;
    },
    get source() {
      return props.options.priceLineSource;
    },
    get show_adv() {
      return props.show_price_line;
    },
    get submit() {
      return props.submit;
    }
  }), createComponent(PriceLabel, {
    get show_adv() {
      return props.show_price_line;
    },
    get title() {
      return props.options.title;
    },
    get visible() {
      return props.options.lastValueVisible;
    },
    get submit() {
      return props.submit;
    }
  })];
}
function PlotLine(props) {
  return (() => {
    var _el$37 = _tmpl$11$1(),
      _el$38 = _el$37.firstChild;
    insert(_el$37, createComponent(Checkbox, {
      get key() {
        return props.keys[1];
      },
      get checked() {
        return props.vis;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    insert(_el$37, createComponent(ColorInputWrapper, {
      get key() {
        return props.keys[2];
      },
      get ["default"]() {
        return props.color;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    insert(_el$37, createComponent(LineWidthPicker, {
      get key() {
        return props.keys[3];
      },
      get ["default"]() {
        return props.width;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    insert(_el$37, createComponent(LineTypePicker, {
      get key() {
        return props.keys[5];
      },
      get ["default"]() {
        return props.type;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    insert(_el$37, createComponent(LineStylePicker, {
      get key() {
        return props.keys[4];
      },
      get ["default"]() {
        return props.style;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    createRenderEffect(_p$ => {
      var _v$ = props.keys[1],
        _v$2 = props.keys[0];
      _v$ !== _p$.e && setAttribute(_el$38, "for", _p$.e = _v$);
      _v$2 !== _p$.t && (_el$38.innerText = _p$.t = _v$2);
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$37;
  })();
}
function PriceLabel(props) {
  return createComponent(Show, {
    get when() {
      return props.show_adv;
    },
    get children() {
      var _el$39 = _tmpl$12$1(),
        _el$40 = _el$39.firstChild,
        _el$41 = _el$40.nextSibling;
      _el$40.innerText = "Price Label:";
      insert(_el$39, createComponent(Checkbox, {
        key: "lastValueVisible",
        get checked() {
          return props.visible;
        },
        get submit() {
          return props.submit;
        }
      }), _el$41);
      addEventListener(_el$41, "input", props.submit, true);
      createRenderEffect(() => _el$41.value = props.title);
      return _el$39;
    }
  });
}
function PriceLine(props) {
  return createComponent(Show, {
    get when() {
      return props.show_adv;
    },
    get children() {
      var _el$42 = _tmpl$13(),
        _el$43 = _el$42.firstChild;
      _el$43.innerText = "Price Line:";
      insert(_el$42, createComponent(Checkbox, {
        key: "priceLineVisible",
        get checked() {
          return props.visible;
        },
        get submit() {
          return props.submit;
        }
      }), null);
      insert(_el$42, createComponent(ColorInputWrapper, {
        key: "priceLineColor",
        get ["default"]() {
          return props.color;
        },
        get submit() {
          return props.submit;
        }
      }), null);
      insert(_el$42, createComponent(LineWidthPicker, {
        key: "priceLineWidth",
        get ["default"]() {
          return props.width;
        },
        get submit() {
          return props.submit;
        }
      }), null);
      insert(_el$42, createComponent(LineSourcePicker, {
        key: "priceLineSource",
        get ["default"]() {
          return props.source;
        },
        get submit() {
          return props.submit;
        }
      }), null);
      insert(_el$42, createComponent(LineStylePicker, {
        key: "priceLineStyle",
        get ["default"]() {
          return props.style;
        },
        get submit() {
          return props.submit;
        }
      }), null);
      return _el$42;
    }
  });
}
function Markers(props) {
  return createComponent(Show, {
    get when() {
      return props.show_adv;
    },
    get children() {
      var _el$44 = _tmpl$14(),
        _el$45 = _el$44.firstChild,
        _el$46 = _el$45.nextSibling;
      _el$45.innerText = "Data Markers:";
      insert(_el$44, createComponent(Checkbox, {
        key: "pointMarkersVisible",
        get checked() {
          return props.options.pointMarkersVisible;
        },
        get submit() {
          return props.submit;
        }
      }), _el$46);
      _el$46.innerText = "Radius:";
      insert(_el$44, createComponent(LineWidthPicker, {
        key: "pointMarkersRadius",
        get ["default"]() {
          return props.options.pointMarkersRadius ?? 2.5;
        },
        get submit() {
          return props.submit;
        }
      }), null);
      return _el$44;
    }
  });
}
function Crosshair(props) {
  return createComponent(Show, {
    get when() {
      return props.show_adv;
    },
    get children() {
      var _el$47 = _tmpl$15(),
        _el$48 = _el$47.firstChild,
        _el$49 = _el$48.nextSibling,
        _el$50 = _el$49.nextSibling;
      _el$48.innerText = "Crosshair Mark:";
      insert(_el$47, createComponent(Checkbox, {
        key: "crosshairMarkerVisible",
        get checked() {
          return props.options.crosshairMarkerVisible;
        },
        get submit() {
          return props.submit;
        }
      }), _el$49);
      _el$49.innerText = "Inner:";
      insert(_el$47, createComponent(LineWidthPicker, {
        key: "crosshairMarkerRadius",
        get ["default"]() {
          return props.options.crosshairMarkerRadius;
        },
        get submit() {
          return props.submit;
        }
      }), _el$50);
      insert(_el$47, createComponent(ColorInputWrapper, {
        key: "crosshairMarkerBackgroundColor",
        get ["default"]() {
          return props.options.crosshairMarkerBackgroundColor;
        },
        get submit() {
          return props.submit;
        }
      }), _el$50);
      _el$50.innerText = "Outer:";
      insert(_el$47, createComponent(LineWidthPicker, {
        key: "crosshairMarkerBorderWidth",
        get ["default"]() {
          return props.options.crosshairMarkerBorderWidth;
        },
        get submit() {
          return props.submit;
        }
      }), null);
      insert(_el$47, createComponent(ColorInputWrapper, {
        key: "crosshairMarkerBorderColor",
        get ["default"]() {
          return props.options.crosshairMarkerBorderColor;
        },
        get submit() {
          return props.submit;
        }
      }), null);
      return _el$47;
    }
  });
}
function BarColor(props) {
  return (() => {
    var _el$51 = _tmpl$16(),
      _el$52 = _el$51.firstChild,
      _el$53 = _el$52.nextSibling,
      _el$54 = _el$53.nextSibling,
      _el$55 = _el$54.nextSibling;
    _el$52.innerText = "Body: ";
    _el$53.style.setProperty("flex-grow", "1");
    _el$54.innerText = "Up Color: ";
    insert(_el$51, createComponent(ColorInputWrapper, {
      key: "upColor",
      get ["default"]() {
        return props.opts.upColor;
      },
      get submit() {
        return props.submit;
      }
    }), _el$55);
    _el$55.innerText = "Down Color:";
    _el$55.style.setProperty("margin-left", "12px");
    insert(_el$51, createComponent(ColorInputWrapper, {
      key: "downColor",
      get ["default"]() {
        return props.opts.downColor;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    return _el$51;
  })();
}
function BarWick(props) {
  return (() => {
    var _el$56 = _tmpl$17(),
      _el$57 = _el$56.firstChild,
      _el$58 = _el$57.nextSibling,
      _el$59 = _el$58.nextSibling,
      _el$60 = _el$59.nextSibling;
    _el$57.innerText = "Wick:";
    insert(_el$56, createComponent(Checkbox, {
      key: "wickVisible",
      get checked() {
        return props.opts.wickVisible;
      },
      get submit() {
        return props.submit;
      }
    }), _el$58);
    _el$58.style.setProperty("flex-grow", "1");
    _el$59.innerText = "Up Color: ";
    _el$59.style.setProperty("margin-left", "12px");
    insert(_el$56, createComponent(ColorInputWrapper, {
      key: "wickUpColor",
      get ["default"]() {
        return props.opts.wickUpColor;
      },
      get submit() {
        return props.submit;
      }
    }), _el$60);
    _el$60.innerText = "Down Color:";
    _el$60.style.setProperty("margin-left", "12px");
    insert(_el$56, createComponent(ColorInputWrapper, {
      key: "wickDownColor",
      get ["default"]() {
        return props.opts.wickDownColor;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    return _el$56;
  })();
}
function BarBorder(props) {
  return (() => {
    var _el$61 = _tmpl$18(),
      _el$62 = _el$61.firstChild,
      _el$63 = _el$62.nextSibling,
      _el$64 = _el$63.nextSibling,
      _el$65 = _el$64.nextSibling;
    _el$62.innerText = "Border:";
    insert(_el$61, createComponent(Checkbox, {
      key: "borderVisible",
      get checked() {
        return props.opts.borderVisible;
      },
      get submit() {
        return props.submit;
      }
    }), _el$63);
    _el$63.style.setProperty("flex-grow", "1");
    _el$64.innerText = "Up Color: ";
    _el$64.style.setProperty("margin-left", "12px");
    insert(_el$61, createComponent(ColorInputWrapper, {
      key: "borderUpColor",
      get ["default"]() {
        return props.opts.borderUpColor;
      },
      get submit() {
        return props.submit;
      }
    }), _el$65);
    _el$65.innerText = "Down Color:";
    _el$65.style.setProperty("margin-left", "12px");
    insert(_el$61, createComponent(ColorInputWrapper, {
      key: "borderDownColor",
      get ["default"]() {
        return props.opts.borderDownColor;
      },
      get submit() {
        return props.submit;
      }
    }), null);
    return _el$61;
  })();
}
function Checkbox(props) {
  return (() => {
    var _el$66 = _tmpl$19();
    addEventListener(_el$66, "input", props.submit, true);
    createRenderEffect(() => setAttribute(_el$66, "id", props.key));
    createRenderEffect(() => _el$66.checked = props.checked);
    return _el$66;
  })();
}
function LineWidthPicker(props) {
  return (() => {
    var _el$67 = _tmpl$20();
    addEventListener(_el$67, "input", props.submit, true);
    createRenderEffect(() => setAttribute(_el$67, "id", props.key));
    createRenderEffect(() => _el$67.value = props.default);
    return _el$67;
  })();
}
function LineStylePicker(props) {
  return (() => {
    var _el$68 = _tmpl$21(),
      _el$69 = _el$68.firstChild;
    addEventListener(_el$69, "input", props.submit, true);
    insert(_el$69, createComponent(For, {
      get each() {
        return Object.entries(h);
      },
      children: ([name, style]) => {
        if (typeof style === "number") return (() => {
          var _el$70 = _tmpl$22();
          _el$70.value = style;
          _el$70.innerText = name;
          createRenderEffect(() => _el$70.selected = props.default === style ? true : void 0);
          return _el$70;
        })();
      }
    }));
    insert(_el$68, createComponent(Icon, {
      get icon() {
        return icons.menu_arrow_ns;
      }
    }), null);
    createRenderEffect(() => setAttribute(_el$69, "id", props.key));
    createRenderEffect(() => _el$69.value = props.default);
    return _el$68;
  })();
}
function LineTypePicker(props) {
  return (() => {
    var _el$71 = _tmpl$21(),
      _el$72 = _el$71.firstChild;
    addEventListener(_el$72, "input", props.submit, true);
    insert(_el$72, createComponent(For, {
      get each() {
        return Object.entries(r);
      },
      children: ([name, style]) => {
        if (typeof style === "number") return (() => {
          var _el$73 = _tmpl$22();
          _el$73.value = style;
          _el$73.innerText = name;
          createRenderEffect(() => _el$73.selected = props.default === style ? true : void 0);
          return _el$73;
        })();
      }
    }));
    insert(_el$71, createComponent(Icon, {
      get icon() {
        return icons.menu_arrow_ns;
      }
    }), null);
    createRenderEffect(() => setAttribute(_el$72, "id", props.key));
    createRenderEffect(() => _el$72.value = props.default);
    return _el$71;
  })();
}
function LineSourcePicker(props) {
  return (() => {
    var _el$74 = _tmpl$21(),
      _el$75 = _el$74.firstChild;
    addEventListener(_el$75, "input", props.submit, true);
    insert(_el$75, createComponent(For, {
      get each() {
        return Object.entries(Ai);
      },
      children: ([name, style]) => {
        if (typeof style === "number") return (() => {
          var _el$76 = _tmpl$22();
          _el$76.value = style;
          _el$76.innerText = name;
          createRenderEffect(() => _el$76.selected = props.default === style ? true : void 0);
          return _el$76;
        })();
      }
    }));
    insert(_el$74, createComponent(Icon, {
      get icon() {
        return icons.menu_arrow_ns;
      }
    }), null);
    createRenderEffect(() => setAttribute(_el$75, "id", props.key));
    createRenderEffect(() => _el$75.value = props.default);
    return _el$74;
  })();
}
function ColorInputWrapper(props) {
  return createComponent(ColorInput, {
    get id() {
      return props.key;
    },
    get input_id() {
      return props.key;
    },
    get init_color() {
      return props.default;
    },
    "class": "color_input_wrapper",
    get onInput() {
      return props.submit;
    }
  });
}
delegateEvents(["click", "input"]);

var _tmpl$$f = /* @__PURE__ */template(`<div><div class=navigator_style_bar>`),
  _tmpl$2$a = /* @__PURE__ */template(`<div class=navigator_menu_tab>`);
function NavigatorMenu(props) {
  const [, divProps] = splitProps(props, ["tabs"]);
  const activeTab = createSignal(Object.keys(props.tabs)[0]);
  return [createComponent(Tabs, mergeProps(divProps, {
    get items() {
      return Object.keys(props.tabs);
    },
    activeTab
  })), createComponent(For, {
    get each() {
      return Object.entries(props.tabs);
    },
    children: ([item, Component2]) => createComponent(Show, {
      get when() {
        return activeTab[0]() === item;
      },
      children: Component2
    })
  })];
}
function Tabs(props) {
  const [, divProps] = splitProps(props, ["activeTab", "items", "overlay_id"]);
  const [getNavBar, setNavBar] = createSignal();
  const [getIndicatorStyle, setIndicatorStyle] = createSignal();
  const updateIndicatorStyle = () => {
    if (getNavBar() === void 0) return;
    const activeElement = [...Array.from(getNavBar().children)].find(e => e.hasAttribute("active"));
    setIndicatorStyle(activeElement ? {
      left: `${activeElement.offsetLeft || 0}px`,
      width: `${activeElement.offsetWidth || 0}px`
    } : {
      left: "0",
      width: "100%"
    });
  };
  onMount(() => {
    if (props.overlay_id) {
      const overlayShow = OverlayCTX().getDisplayAccessor(props.overlay_id);
      createEffect(on$1(overlayShow, updateIndicatorStyle));
    }
  });
  createEffect(on$1(props.activeTab[0], updateIndicatorStyle));
  return (() => {
    var _el$ = _tmpl$$f(),
      _el$2 = _el$.firstChild;
    use(setNavBar, _el$);
    spread(_el$, divProps, false, true);
    insert(_el$, createComponent(For, {
      get each() {
        return props.items;
      },
      children: item => (() => {
        var _el$3 = _tmpl$2$a();
        _el$3.$$click = () => props.activeTab[1](item);
        insert(_el$3, item);
        createRenderEffect(() => setAttribute(_el$3, "active", props.activeTab[0]() === item ? "" : void 0));
        return _el$3;
      })()
    }), _el$2);
    createRenderEffect(_$p => style(_el$2, getIndicatorStyle(), _$p));
    return _el$;
  })();
}
delegateEvents(["click"]);

var _tmpl$$e = /* @__PURE__ */template(`<div class=title_box><h2>`),
  _tmpl$2$9 = /* @__PURE__ */template(`<div class=form_wrapper><form class=input_form></form><div class=footer><input type=submit value=Apply>`),
  _tmpl$3$4 = /* @__PURE__ */template(`<div class=group><h3>`),
  _tmpl$4$4 = /* @__PURE__ */template(`<div class=inline>`),
  _tmpl$5$4 = /* @__PURE__ */template(`<datalist>`),
  _tmpl$6$3 = /* @__PURE__ */template(`<span class=tooltip><span class=tooltiptext>`),
  _tmpl$7$3 = /* @__PURE__ */template(`<div class=input_block><label>`),
  _tmpl$8$1 = /* @__PURE__ */template(`<option>`),
  _tmpl$9$1 = /* @__PURE__ */template(`<input type=checkbox>`),
  _tmpl$0 = /* @__PURE__ */template(`<input type=text>`),
  _tmpl$1 = /* @__PURE__ */template(`<input type=datetime-local>`),
  _tmpl$10 = /* @__PURE__ */template(`<input>`),
  _tmpl$11 = /* @__PURE__ */template(`<span class=select-span><select>`),
  _tmpl$12 = /* @__PURE__ */template(`<span class=select-span><select type=source>`);
function generateOptionsMenu(props) {
  OverlayCTX().attachOverlay(props.id, () => createComponent(OptionsMenu, props));
}
function OptionsMenu(props) {
  const [location, setLocation] = createSignal({
    x: 0,
    y: 0
  });
  const position_menu = () => {
    setLocation({
      x: window.innerWidth * 0.7,
      y: window.innerHeight * 0.2
    });
  };
  let compiled_tabs = {};
  for (const [key, value] of Object.entries(props.tabs)) {
    if (typeof value === "object") compiled_tabs[key] = () => createComponent(OptionsForm, {
      menu_struct: value,
      get options() {
        return props.options;
      },
      get on_submit() {
        return props.on_submit;
      }
    });else if (value !== void 0) compiled_tabs[key] = value;
  }
  const displaySetter = OverlayCTX().getDisplaySetter(props.id);
  const close_menu = () => displaySetter(false);
  onMount(() => {
    setTimeout(() => displaySetter(true), 100);
  });
  return createComponent(OverlayDiv, {
    get id() {
      return props.id;
    },
    oneshot: true,
    location,
    setLocation,
    classList: {
      options_menu: true
    },
    get location_ref() {
      return location_reference.CENTER;
    },
    updateLocation: position_menu,
    get drag_handle() {
      return `#${props.id}>.title_box`;
    },
    get bounding_client_id() {
      return `#${props.id}>.title_box`;
    },
    get children() {
      return [(() => {
        var _el$ = _tmpl$$e(),
          _el$2 = _el$.firstChild;
        insert(_el$2, () => props.title);
        insert(_el$, createComponent(Icon, {
          get icon() {
            return icons.close;
          },
          force_reload: true,
          onClick: close_menu
        }), null);
        return _el$;
      })(), createComponent(NavigatorMenu, {
        get overlay_id() {
          return props.id;
        },
        style: {
          padding: "2px 6px",
          margin: "12px",
          "margin-top": "0px",
          "border-bottom": "2px solid var(--background-fill)"
        },
        tabs: compiled_tabs
      })];
    }
  });
}
function OptionsForm(props) {
  const [passDown] = splitProps(props, ["options"]);
  let form = document.createElement("form");
  const submit = () => form.requestSubmit();
  const wrappedSubmit = e => {
    let opts = packageInput(e);
    if (opts) props.on_submit(opts);
  };
  return (() => {
    var _el$3 = _tmpl$2$9(),
      _el$4 = _el$3.firstChild,
      _el$5 = _el$4.nextSibling,
      _el$6 = _el$5.firstChild;
    _el$4.addEventListener("keypress", e => {
      if (e.key === "Enter") submit();
    });
    _el$4.addEventListener("submit", wrappedSubmit);
    var _ref$ = form;
    typeof _ref$ === "function" ? use(_ref$, _el$4) : form = _el$4;
    insert(_el$4, createComponent(For, {
      get each() {
        return Object.entries(props.menu_struct);
      },
      children: ([key, [type, params]]) => createComponent(Switch, {
        get fallback() {
          return createComponent(Input, mergeProps({
            key,
            type,
            params,
            submit
          }, passDown));
        },
        get children() {
          return [createComponent(Match, {
            when: type === "group",
            get children() {
              return createComponent(Group, mergeProps({
                title: key,
                params,
                submit
              }, passDown));
            }
          }), createComponent(Match, {
            when: type === "inline",
            get children() {
              return createComponent(Inline, mergeProps({
                title: key,
                params,
                submit
              }, passDown));
            }
          })];
        }
      })
    }));
    _el$6.$$click = submit;
    return _el$3;
  })();
}
function packageInput(e) {
  e.preventDefault();
  if (e.target !== null) {
    let nodes = Array.from(e.target.querySelectorAll("input, select"));
    nodes = nodes.filter(node => node.id !== "");
    return Object.fromEntries(Array.from(nodes, node => {
      switch (node.getAttribute("type")) {
        case "checkbox":
          return [node.id, node.checked];
        case "number":
        case "range":
          return [node.id, parseFloat(node.value)];
        default:
          return [node.id, node.value];
      }
    }));
  }
}
function Group(props) {
  const [passDown] = splitProps(props, ["options", "submit"]);
  return (() => {
    var _el$7 = _tmpl$3$4(),
      _el$8 = _el$7.firstChild;
    insert(_el$7, createComponent(For, {
      get each() {
        return Object.entries(props.params);
      },
      children: ([key, [type, params]]) => createComponent(Switch, {
        get fallback() {
          return createComponent(Input, mergeProps({
            key,
            type,
            params
          }, passDown));
        },
        get children() {
          return createComponent(Match, {
            when: type === "inline",
            get children() {
              return createComponent(Inline, mergeProps({
                title: key,
                params
              }, passDown));
            }
          });
        }
      })
    }), null);
    createRenderEffect(() => _el$8.innerText = props.title);
    return _el$7;
  })();
}
function Inline(props) {
  const [passDown] = splitProps(props, ["options", "submit"]);
  return (() => {
    var _el$9 = _tmpl$4$4();
    insert(_el$9, createComponent(For, {
      get each() {
        return Object.entries(props.params);
      },
      children: ([key, [type, params]]) => createComponent(Input, mergeProps({
        key,
        type,
        params
      }, passDown))
    }));
    return _el$9;
  })();
}
function Input(props) {
  const [, inputProps] = splitProps(props, ["type"]);
  return (() => {
    var _el$0 = _tmpl$7$3(),
      _el$1 = _el$0.firstChild;
    insert(_el$0, createComponent(Show, {
      get when() {
        return props.params.options && props.type !== "enum";
      },
      get children() {
        var _el$10 = _tmpl$5$4();
        insert(_el$10, createComponent(For, {
          get each() {
            return props.params.options;
          },
          children: option => (() => {
            var _el$13 = _tmpl$8$1();
            _el$13.value = option;
            return _el$13;
          })()
        }));
        createRenderEffect(() => setAttribute(_el$10, "id", props.key + "_datalist"));
        return _el$10;
      }
    }), null);
    insert(_el$0, createComponent(Switch, {
      get children() {
        return [createComponent(Match, {
          get when() {
            return props.type === "bool";
          },
          get children() {
            return createComponent(BoolInput, inputProps);
          }
        }), createComponent(Match, {
          get when() {
            return props.type === "enum";
          },
          get children() {
            return createComponent(EnumInput, inputProps);
          }
        }), createComponent(Match, {
          get when() {
            return props.type === "source";
          },
          get children() {
            return createComponent(SourceInput, inputProps);
          }
        }), createComponent(Match, {
          get when() {
            return props.type === "number";
          },
          get children() {
            return createComponent(NumberInput, inputProps);
          }
        }), createComponent(Match, {
          get when() {
            return props.type === "string";
          },
          get children() {
            return createComponent(StringInput, inputProps);
          }
        }), createComponent(Match, {
          get when() {
            return props.type === "timestamp";
          },
          get children() {
            return createComponent(TimeInput, inputProps);
          }
        }), createComponent(Match, {
          get when() {
            return props.type === "color";
          },
          get children() {
            return createComponent(ColorInputWrap, inputProps);
          }
        })];
      }
    }), null);
    insert(_el$0, createComponent(Show, {
      get when() {
        return props.params.tooltip;
      },
      get children() {
        var _el$11 = _tmpl$6$3(),
          _el$12 = _el$11.firstChild;
        insert(_el$11, createComponent(TextIcon, {
          text: "?"
        }), _el$12);
        createRenderEffect(() => _el$12.innerHTML = props.params.tooltip);
        return _el$11;
      }
    }), null);
    createRenderEffect(_p$ => {
      var _v$ = props.key,
        _v$2 = props.params.title + (props.params.title !== "" ? ": " : "");
      _v$ !== _p$.e && setAttribute(_el$1, "for", _p$.e = _v$);
      _v$2 !== _p$.t && (_el$1.innerText = _p$.t = _v$2);
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$0;
  })();
}
function BoolInput(props) {
  return (() => {
    var _el$14 = _tmpl$9$1();
    addEventListener(_el$14, "input", props.params.autosend ? props.submit : void 0, true);
    createRenderEffect(() => setAttribute(_el$14, "id", props.key));
    createRenderEffect(() => _el$14.checked = props.options[props.key] ?? false);
    return _el$14;
  })();
}
function StringInput(props) {
  return (() => {
    var _el$15 = _tmpl$0();
    addEventListener(_el$15, "input", props.params.autosend ? props.submit : void 0, true);
    createRenderEffect(() => setAttribute(_el$15, "id", props.key));
    createRenderEffect(() => _el$15.value = props.options[props.key]);
    return _el$15;
  })();
}
function TimeInput(props) {
  return (() => {
    var _el$16 = _tmpl$1();
    addEventListener(_el$16, "input", props.params.autosend ? props.submit : void 0, true);
    createRenderEffect(() => setAttribute(_el$16, "id", props.key));
    createRenderEffect(() => _el$16.value = UnixToString(props.options[props.key]));
    return _el$16;
  })();
}
function NumberInput(props) {
  return (() => {
    var _el$17 = _tmpl$10();
    addEventListener(_el$17, "input", props.params.autosend ? props.submit : void 0, true);
    createRenderEffect(_p$ => {
      var _v$3 = props.key,
        _v$4 = props.params.slider ? "range" : "number",
        _v$5 = props.params.max,
        _v$6 = props.params.min,
        _v$7 = props.params.step,
        _v$8 = props.params.options ? props.key + "_datalist" : void 0;
      _v$3 !== _p$.e && setAttribute(_el$17, "id", _p$.e = _v$3);
      _v$4 !== _p$.t && setAttribute(_el$17, "type", _p$.t = _v$4);
      _v$5 !== _p$.a && setAttribute(_el$17, "max", _p$.a = _v$5);
      _v$6 !== _p$.o && setAttribute(_el$17, "min", _p$.o = _v$6);
      _v$7 !== _p$.i && setAttribute(_el$17, "step", _p$.i = _v$7);
      _v$8 !== _p$.n && setAttribute(_el$17, "list", _p$.n = _v$8);
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0,
      o: void 0,
      i: void 0,
      n: void 0
    });
    createRenderEffect(() => _el$17.value = props.options[props.key]);
    return _el$17;
  })();
}
function EnumInput(props) {
  return (() => {
    var _el$18 = _tmpl$11(),
      _el$19 = _el$18.firstChild;
    addEventListener(_el$19, "input", props.params.autosend ? props.submit : void 0, true);
    insert(_el$19, createComponent(For, {
      get each() {
        return props.params.options;
      },
      children: option => (() => {
        var _el$20 = _tmpl$8$1();
        _el$20.value = option;
        _el$20.innerText = option;
        createRenderEffect(() => _el$20.selected = option == props.options[props.key] ? true : void 0);
        return _el$20;
      })()
    }));
    insert(_el$18, createComponent(Icon, {
      get icon() {
        return icons.menu_arrow_ns;
      }
    }), null);
    createRenderEffect(() => setAttribute(_el$19, "id", props.key));
    return _el$18;
  })();
}
function ColorInputWrap(props) {
  return createComponent(ColorInput, {
    get id() {
      return props.key;
    },
    get input_id() {
      return props.key;
    },
    get init_color() {
      return props.options[props.key];
    },
    "class": "color_input_wrapper",
    get onInput() {
      return props.params.autosend ? props.submit : void 0;
    }
  });
}
function SourceInput(props) {
  return (() => {
    var _el$21 = _tmpl$12(),
      _el$22 = _el$21.firstChild;
    addEventListener(_el$22, "input", props.params.autosend ? props.submit : void 0, true);
    insert(_el$21, createComponent(Icon, {
      get icon() {
        return icons.menu_arrow_ns;
      }
    }), null);
    createRenderEffect(() => setAttribute(_el$22, "id", props.key));
    return _el$21;
  })();
}
delegateEvents(["click", "input"]);

const tv_chart_css_rule = (() => {
  for (const sheet of Array.from(document.styleSheets)) if (sheet.href !== null && sheet.href.endsWith(".css")) {
    for (const rule of Array.from(sheet.cssRules)) if (rule.selectorText === ".tv-lightweight-charts") return rule;
  }
})();
const [selectedDot, setSelectedDot] = createSignal(false);
const [selectedArrow, setSelectedArrow] = createSignal(false);
const [selectedCross, setSelectedCross] = createSignal(false);
const CrosshairCursor = {
  icon: icons.cursor_cross,
  label: "Crosshair",
  execute: setCrosshair,
  selected: selectedCross
};
const ArrowCursor = {
  icon: icons.cursor_arrow,
  label: "Arrow",
  execute: setArrow,
  selected: selectedArrow
};
const DotCursor = {
  icon: icons.cursor_dot,
  label: "Dot",
  execute: setDot,
  selected: selectedDot
};
function setCrosshair() {
  if (tv_chart_css_rule) {
    tv_chart_css_rule.style.cursor = "crosshair";
    setSelectedDot(false);
    setSelectedArrow(false);
    setSelectedCross(true);
  }
}
function setArrow() {
  if (tv_chart_css_rule) {
    tv_chart_css_rule.style.cursor = "";
    setSelectedDot(false);
    setSelectedArrow(true);
    setSelectedCross(false);
  }
}
const cursor_dot = `url('data:image/svg+xml,<svg width="12px" height="12px" style="fill:white" viewBox="-4 -4 8.00 8.00" xmlns="http://www.w3.org/2000/svg"><path d="M -2.2 0 C -2.201.711 -0.37 2.769 1.097 1.922 C 1.777 1.529 2.197 0.803 2.197 0.017 C 2.197 -1.677 0.363 -2.735 -1.103 -1.888 C -1.784 -1.495 -2.203 -0.769 -2.203 0.017 Z"/></svg>') 6 6, auto`;
function setDot() {
  if (tv_chart_css_rule) {
    tv_chart_css_rule.style.cursor = cursor_dot;
    setSelectedDot(true);
    setSelectedArrow(false);
    setSelectedCross(false);
  }
}

var cssBGFillColor = getComputedStyle(document.body).getPropertyValue("--layout-main-fill");
var cssAccentColor = getComputedStyle(document.body).getPropertyValue("--accent-color");
getComputedStyle(document.body).getPropertyValue("--font");
function reloadComputedCanvasStyle() {
  cssBGFillColor = getComputedStyle(document.body).getPropertyValue("--layout-main-fill");
  cssAccentColor = getComputedStyle(document.body).getPropertyValue("--accent-color");
  getComputedStyle(document.body).getPropertyValue("--font");
}
window.reloadComputedCanvasStyle = reloadComputedCanvasStyle;
const DEFAULT_STROKE_STYLE = {
  "width": 2,
  "lineColor": cssAccentColor,
  "lineStyle": h.Solid,
  "lineCap": "butt",
  "lineJoin": "round"
};
function setCanvasStokeStyle(ctx, opts) {
  ctx.lineWidth = opts.width;
  ctx.strokeStyle = opts.lineColor;
  ctx.lineJoin = opts.lineJoin;
  ctx.lineCap = opts.lineCap;
  setLineStyle(ctx, opts.lineStyle);
}
function setLineStyle(ctx, style) {
  if (typeof style !== "number") {
    ctx.setLineDash(style);
    return;
  }
  let _style = [];
  switch (style) {
    case 0 /* Solid */:
      break;
    case 1 /* Dotted */:
      _style = [ctx.lineWidth, ctx.lineWidth];
      break;
    case 2 /* Dashed */:
      _style = [2 * ctx.lineWidth, 2 * ctx.lineWidth];
      break;
    case 3 /* LargeDashed */:
      _style = [6 * ctx.lineWidth, 6 * ctx.lineWidth];
      break;
    case 4 /* SparseDotted */:
      _style = [ctx.lineWidth, 4 * ctx.lineWidth];
      break;
  }
  ctx.setLineDash(_style);
}
function draw_dot(ctx, p, sel = false, color = cssBGFillColor, borderColor = cssAccentColor) {
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 6, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = borderColor;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, sel ? 4 : 5, sel ? 4 : 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function ensureDefined(value) {
  if (value === void 0) {
    throw new Error("Value is undefined");
  }
  return value;
}

const PRIMITIVE_SET = Symbol("PrimitiveSet");
function isPrimitiveSet(obj) {
  return obj !== null && typeof obj === "object" && PRIMITIVE_SET in obj;
}
class PrimitiveSet {
  [ORDERABLE] = true;
  [ORDERABLE_SET] = true;
  [PRIMITIVE_SET] = true;
  dropDownMode = "auto";
  _id;
  _name;
  _series;
  _pane;
  _frame;
  primitives;
  setPrimitives;
  leafProps;
  branchProps;
  constructor(pane) {
    this._pane = pane;
    this._frame = pane.frame;
    this._series = this._pane.paneApi.addSeries(Jn, {
      color: "transparent",
      autoscaleInfoProvider: () => null
    });
    this._id = "";
    this._name = void 0;
    const sig = createSignal([]);
    this.primitives = sig[0];
    this.setPrimitives = sig[1];
    createEffect(() => this._series.setData([this._frame.primitiveData()]));
    this.leafProps = {
      id: this.id,
      leafTitle: this.name,
      obj: this
    };
    this.branchProps = {
      id: this.id,
      branchTitle: "Primitive Set",
      dropDownMode: "auto",
      reorderables: this.primitives,
      reorder: this.reorderPrimitives.bind(this),
      moveTo: () => {}
    };
  }
  get id() {
    return this._id;
  }
  get name() {
    return this._name ?? "";
  }
  get length() {
    return this.primitives().length;
  }
  get pane() {
    return this._pane;
  }
  get frame() {
    return this._frame;
  }
  //@ts-ignore: _series.Jn.kh === seriesAPI._series._primitives[] for Lightweight-Charts v5.0.8
  get _primitiveWrapperArray() {
    return this._series.Jn.kh;
  }
  //@ts-ignore: _series.Jn.kh[].ah === seriesAPI._series._primitives[].PrimitiveBase for Lightweight-Charts v5.0.8
  get _primitives() {
    return Array.from(this._primitiveWrapperArray, wrapper => wrapper.ah);
  }
  attachPrimitive(primitive) {
    primitive.setParent(this);
    this._series.attachPrimitive(primitive);
    this.setPrimitives([...this.primitives(), primitive]);
  }
  detachPrimitive(primitive) {
    primitive.setParent(void 0);
    this._series.detachPrimitive(primitive);
    this.setPrimitives(this.primitives().filter(prim => prim.id !== primitive._id));
  }
  reorderPrimitives(from, to) {
    this._primitiveWrapperArray.splice(to, 0, ...this._primitiveWrapperArray.splice(from, 1));
    this.setPrimitives(this._primitives);
  }
}

const DEFAULT_PRIMITIVE_OPTS = {
  visible: true,
  tangible: true,
  autoscale: false
};
var HIT_RESULT = /* @__PURE__ */(HIT_RESULT2 => {
  HIT_RESULT2[HIT_RESULT2["ControlPt4"] = -13] = "ControlPt4";
  HIT_RESULT2[HIT_RESULT2["ControlPt3"] = -12] = "ControlPt3";
  HIT_RESULT2[HIT_RESULT2["ControlPt2"] = -11] = "ControlPt2";
  HIT_RESULT2[HIT_RESULT2["ControlPt1"] = -10] = "ControlPt1";
  HIT_RESULT2[HIT_RESULT2["Body"] = -9] = "Body";
  HIT_RESULT2[HIT_RESULT2["Stroke"] = -8] = "Stroke";
  HIT_RESULT2[HIT_RESULT2["StartPt"] = -7] = "StartPt";
  HIT_RESULT2[HIT_RESULT2["MidPt"] = -6] = "MidPt";
  HIT_RESULT2[HIT_RESULT2["EndPt"] = -5] = "EndPt";
  HIT_RESULT2[HIT_RESULT2["Label"] = -4] = "Label";
  HIT_RESULT2[HIT_RESULT2["SelectionBox"] = -2] = "SelectionBox";
  HIT_RESULT2[HIT_RESULT2["Foreground"] = -2] = "Foreground";
  HIT_RESULT2[HIT_RESULT2["Background"] = -1] = "Background";
  HIT_RESULT2[HIT_RESULT2["P0"] = 0] = "P0";
  HIT_RESULT2[HIT_RESULT2["P1"] = 1] = "P1";
  HIT_RESULT2[HIT_RESULT2["P2"] = 2] = "P2";
  HIT_RESULT2[HIT_RESULT2["P3"] = 3] = "P3";
  HIT_RESULT2[HIT_RESULT2["P4"] = 4] = "P4";
  HIT_RESULT2[HIT_RESULT2["P5"] = 5] = "P5";
  HIT_RESULT2[HIT_RESULT2["P6"] = 6] = "P6";
  HIT_RESULT2[HIT_RESULT2["P7"] = 7] = "P7";
  HIT_RESULT2[HIT_RESULT2["P8"] = 8] = "P8";
  HIT_RESULT2[HIT_RESULT2["P9"] = 9] = "P9";
  HIT_RESULT2[HIT_RESULT2["P10"] = 10] = "P10";
  return HIT_RESULT2;
})(HIT_RESULT || {});
function isPrimitive(obj) {
  return obj instanceof PrimitiveBase;
}
class PrimitiveBase {
  [ORDERABLE] = true;
  _frame;
  _parent;
  _chart;
  _series;
  leafProps;
  _id = "";
  _name = void 0;
  _type = "null";
  _options;
  // State variable controlled by the charting_frame. 
  // True when the primitive has been clicked on using any mouse button.
  selected;
  setSelected;
  shortcuts;
  ctxMenuStruct;
  _requestUpdate;
  // requestUpdate() can be called to force a repaint of the chart's canvas
  // Internally this calls ChartModel.fullUpdate() which sets an invalidation mask. 
  // Given the naming my assumption is this is good to call multiple times in a row 
  // and will only result in a single render update once the invalidation mask is serviced
  requestUpdate() {
    if (this._requestUpdate) this._requestUpdate();
  }
  constructor(_id, _type, _opts) {
    this._id = _id;
    this._type = _type;
    this._options = {
      ...DEFAULT_PRIMITIVE_OPTS,
      ..._opts
    };
    const sig = createSignal(false);
    this.selected = sig[0];
    this.setSelected = sig[1];
    createEffect(on$1(this.selected, () => this.requestUpdate()));
    this.leafProps = {
      id: _id,
      obj: this,
      leafTitle: this.name
    };
  }
  get id() {
    return this._id;
  }
  get name() {
    return this._name ?? this._type;
  }
  get chart() {
    return ensureDefined(this._chart);
  }
  get series() {
    return ensureDefined(this._series);
  }
  setParent(parent) {
    this._parent = parent;
  }
  options() {
    return structuredClone(this._options);
  }
  onActivation() {
    console.log("activate primitive", this._type);
    this.setSelected(true);
    if (this.shortcuts) KeyboardCTX().attachHandler(this.id, this.shortcuts);
  }
  onDeactivation() {
    console.log("deactivate primitive", this._type);
    this.setSelected(false);
    if (this.shortcuts) KeyboardCTX().detachHandler(this.id);
  }
  remove() {
    if (isPrimitiveSet(this._parent)) {
      this._parent.detachPrimitive(this);
    }
  }
  applyOptions(opts, externalCall = false) {
    if (opts === void 0) return;
    this._options = {
      ...this._options,
      ...opts
    };
    this.requestUpdate();
    if (!externalCall && this._frame && this._parent) {
      window.api.update_primitive_options(this._frame.id.substring(0, 6),
      // Container ID only
      this._frame.id, this._parent.id, this.id, this._options);
    }
  }
  //#region ------------------- Mouse Event Implementation Functions -------------------
  //** Invoked by Lightweight-Charts when the Primitive is attached to the chart. */
  attached({
    chart,
    series,
    requestUpdate
  }) {
    this._chart = chart;
    this._series = series;
    this._frame = this._parent?.frame;
    if (this.onDataUpdate) {
      this._series.subscribeDataChanged(this._fireDataUpdated);
    }
    if (this._frame) {
      if (this.onCrosshairMove) {
        this._frame.subscribeMouseEvent("crosshair", this._fireCrosshairMove);
      }
      if (this.onMouseMove) {
        this._frame.subscribeMouseEvent("mousemove", this._fireMouseMove);
      }
      if (this.onWheel) {
        this._frame.subscribeMouseEvent("wheel", this._fireWheel);
      }
      if (this.onMouseEnter) {
        this._frame.subscribeMouseEvent("mouseenter", this._fireMouseEnter);
      }
      if (this.onMouseLeave) {
        this._frame.subscribeMouseEvent("mouseleave", this._fireMouseLeave);
      }
      if (this.onMouseOver) {
        this._frame.subscribeMouseEvent("mouseover", this._fireMouseOver);
      }
      if (this.onMouseOut) {
        this._frame.subscribeMouseEvent("mouseout", this._fireMouseOut);
      }
    }
    this._requestUpdate = requestUpdate;
    this.requestUpdate();
  }
  //** Invoked by Lightweight-Charts when the Primitive removed from the chart. */
  detached() {
    if (this.onDataUpdate && this._series) {
      this._series.unsubscribeDataChanged(this._fireDataUpdated);
    }
    if (this._frame) {
      if (this.onCrosshairMove) {
        this._frame.unsubscribeMouseEvent("crosshair", this._fireCrosshairMove);
      }
      if (this.onMouseMove) {
        this._frame.unsubscribeMouseEvent("mousemove", this._fireMouseMove);
      }
      if (this.onWheel) {
        this._frame.unsubscribeMouseEvent("wheel", this._fireWheel);
      }
      if (this.onMouseEnter) {
        this._frame.unsubscribeMouseEvent("mouseenter", this._fireMouseEnter);
      }
      if (this.onMouseLeave) {
        this._frame.unsubscribeMouseEvent("mouseleave", this._fireMouseLeave);
      }
      if (this.onMouseOver) {
        this._frame.unsubscribeMouseEvent("mouseover", this._fireMouseOver);
      }
      if (this.onMouseOut) {
        this._frame.unsubscribeMouseEvent("mouseout", this._fireMouseOut);
      }
    }
    this._chart = void 0;
    this._series = void 0;
    this._requestUpdate = void 0;
  }
  fireClickEvent(event, e) {
    switch (event) {
      case "click":
        this.onClick?.(e);
        break;
      case "auxclick":
        this.onAuxClick?.(e);
        break;
      case "dblclick":
        this.onDblClick?.(e);
        break;
      case "mouseup":
        this.onMouseUp?.(e);
        break;
      case "mousedown":
        this.onMouseDown?.(e);
        break;
    }
  }
  _fireCrosshairMove = e => this.onCrosshairMove?.(e);
  _fireMouseMove = e => this.onMouseMove?.(e);
  _fireWheel = e => this.onWheel?.(e);
  _fireMouseEnter = e => this.onMouseEnter?.(e);
  _fireMouseLeave = e => this.onMouseLeave?.(e);
  _fireMouseOver = e => this.onMouseOver?.(e);
  _fireMouseOut = e => this.onMouseOut?.(e);
  _fireDataUpdated = scope => this.onDataUpdate?.(scope);
  //#endregion
  //#region ------------------- Utility Functions -------------------
  //TODO: Abstract these w/ dependency injection and move them to the helpers folder
  //Moves a SingleValueData Point by a given number of indecies (in X) and pixels (in Y)
  movePoint(pt, dx, dy) {
    let x = this.chart.timeScale().timeToCoordinate(pt.time);
    let y = this.series.priceToCoordinate(pt.value);
    if (!x || !y) return null;
    let l = this.chart.timeScale().coordinateToLogical(x);
    if (!l) return null;
    x = this.chart.timeScale().logicalToCoordinate(l + dx);
    if (!x) return null;
    let px = this.chart.timeScale().coordinateToTime(x);
    let py = this.series.coordinateToPrice(y + dy);
    if (!px || !py) return null;
    return {
      time: px,
      value: py
    };
  }
  timeToIndex(time) {
    const timescale = this.chart.timeScale();
    return timescale.coordinateToLogical(timescale.timeToCoordinate(time) ?? -1);
  }
  // TODO: Determine if binary searching this frequently (by calling this un renderer.update functions)
  //  is a bad idea or not. only alternative would be to cache the value and setup a method to invalidate 
  // the cache on timeframe change.. when else would it need invalidating?
  nearestBarCoordinate(time, look_left = true) {
    const _nearestTime = this.nearestBarTime(time, look_left);
    return _nearestTime ? this.chart.timeScale().timeToCoordinate(_nearestTime) : null;
  }
  //Returns the nearest visible time to the time given
  nearestBarTime(time, look_left = true) {
    const time_points = this._frame?.timescaleTimes;
    if (time_points === void 0) return null;
    let index = binarySearch(this._frame?.timescaleTimes ?? [], time, (a, b) => a - b);
    if (index >= 0) return time;else if (look_left) return time_points[-index];else return time_points[Math.min(-index + 1, time_points.length - 1)];
  }
  //#endregion
}

class OnePointPrimitive extends PrimitiveBase {
  _p1;
  _options;
  _paneView;
  constructor(id, type, renderer, params) {
    super(id, type, void 0);
    this._options = params.options;
    this._p1 = params.p1;
    this._paneView = new renderer(this);
  }
  updateData(params) {
    if (params.p1) {
      this._p1 = params.p1;
      this.requestUpdate();
    }
    this.applyOptions(params.options);
  }
  //#region --------------- Base Class / Interface Functions --------------- //
  paneViews() {
    return [this._paneView];
  }
  updateAllViews() {
    this._paneView.update();
  }
  autoscaleInfo(startTimePoint, endTimePoint) {
    if (!this._options.autoscale || !this._options.visible || this._p1 === null) return null;
    const p1Index = this.timeToIndex(this._p1.time);
    if (p1Index === null) return null;
    if (endTimePoint < p1Index || startTimePoint > p1Index) return null;
    return {
      priceRange: {
        minValue: this._p1.value,
        maxValue: this._p1.value
      }
    };
  }
  hitTest(x, y) {
    return this._paneView.hitTest(x, y);
  }
  onMouseDown(param) {
    if (!this._options.visible || !this._options.tangible) return;
    if (!param.sourceEvent || !param.logical) return;
    if (this._paneView._hovered != HIT_RESULT.P1 && this._paneView._hovered != HIT_RESULT.Stroke) return;
    let update_func = this._shiftPoint.bind(this, {
      x: param.logical,
      y: param.sourceEvent.localY
    });
    const chart = this.chart;
    const pressedMove = chart.options().handleScroll.valueOf();
    const pressedMoveReEnable = typeof pressedMove == "boolean" ? pressedMove : pressedMove.pressedMouseMove;
    chart.applyOptions({
      handleScroll: {
        pressedMouseMove: false
      }
    });
    chart.subscribeCrosshairMove(update_func);
    document.addEventListener("mouseup", () => {
      chart.unsubscribeCrosshairMove(update_func);
      chart.applyOptions({
        handleScroll: {
          pressedMouseMove: pressedMoveReEnable
        }
      });
    }, {
      once: true
    });
  }
  _shiftPoint(last_point, param) {
    if (!param.logical || !param.sourceEvent || !this._p1) return;
    let dx = param.logical - last_point.x;
    let dy = param.sourceEvent.localY - last_point.y;
    let p1 = this.movePoint(this._p1, dx, dy);
    if (!p1) return;
    this.updateData({
      p1
    });
    last_point.x = param.logical;
    last_point.y = param.sourceEvent.localY;
  }
  //#endregion
}
class OnePointRenderer {
  _p1 = null;
  _source;
  _hovered;
  stroke = null;
  ctx = null;
  constructor(source) {
    this._source = source;
  }
  renderer() {
    return this;
  }
  get options() {
    return this._source._options;
  }
  update() {
    if (this._source._p1 === null) return;
    const series = this._source.series;
    const timeScale = this._source.chart.timeScale();
    let y1 = series.priceToCoordinate(this._source._p1.value);
    let x1 = timeScale.timeToCoordinate(this._source._p1.time);
    if (x1 === null) x1 = this._source.nearestBarCoordinate(this._source._p1.time);
    if (x1 === null || y1 === null) {
      this._p1 = null;
      return;
    }
    this._p1 = {
      x: Math.round(x1),
      y: Math.round(y1)
    };
  }
}

const triggerOptions = { equals: false };
const triggerCacheOptions = triggerOptions;
class TriggerCache {
    #map;
    constructor(mapConstructor = Map) {
        this.#map = new mapConstructor();
    }
    dirty(key) {
        this.#map.get(key)?.$$();
    }
    dirtyAll() {
        for (const trigger of this.#map.values())
            trigger.$$();
    }
    track(key) {
        if (!getListener())
            return;
        let trigger = this.#map.get(key);
        if (!trigger) {
            const [$, $$] = createSignal(undefined, triggerCacheOptions);
            this.#map.set(key, (trigger = { $, $$, n: 1 }));
        }
        else
            trigger.n++;
        onCleanup(() => {
            // remove the trigger when no one is listening to it
            if (--trigger.n === 0)
                // microtask is to avoid removing the trigger used by a single listener
                queueMicrotask(() => trigger.n === 0 && this.#map.delete(key));
        });
        trigger.$();
    }
}

const $OBJECT = Symbol("track-object");
/**
 * A reactive version of `Map` data structure. All the reads (like `get` or `has`) are signals, and all the writes (`delete` or `set`) will cause updates to appropriate signals.
 * @param initial initial entries of the reactive map
 * @param equals signal equals function, determining if a change should cause an update
 * @see https://github.com/solidjs-community/solid-primitives/tree/main/packages/map#ReactiveMap
 * @example
 * const userPoints = new ReactiveMap<User, number>();
 * createEffect(() => {
 *    userPoints.get(user1) // => T: number | undefined (reactive)
 *    userPoints.has(user1) // => T: boolean (reactive)
 *    userPoints.size // => T: number (reactive)
 * });
 * // apply changes
 * userPoints.set(user1, 100);
 * userPoints.delete(user2);
 * userPoints.set(user1, { foo: "bar" });
 */
class ReactiveMap extends Map {
    #keyTriggers = new TriggerCache();
    #valueTriggers = new TriggerCache();
    [Symbol.iterator]() {
        return this.entries();
    }
    constructor(entries) {
        super();
        if (entries)
            for (const entry of entries)
                super.set(...entry);
    }
    get size() {
        this.#keyTriggers.track($OBJECT);
        return super.size;
    }
    *keys() {
        this.#keyTriggers.track($OBJECT);
        for (const key of super.keys()) {
            yield key;
        }
    }
    *values() {
        this.#valueTriggers.track($OBJECT);
        for (const value of super.values()) {
            yield value;
        }
    }
    *entries() {
        this.#keyTriggers.track($OBJECT);
        this.#valueTriggers.track($OBJECT);
        for (const entry of super.entries()) {
            yield entry;
        }
    }
    forEach(callbackfn, thisArg) {
        this.#keyTriggers.track($OBJECT);
        this.#valueTriggers.track($OBJECT);
        super.forEach(callbackfn, thisArg);
    }
    has(key) {
        this.#keyTriggers.track(key);
        return super.has(key);
    }
    get(key) {
        this.#valueTriggers.track(key);
        return super.get(key);
    }
    set(key, value) {
        const hadNoKey = !super.has(key);
        const hasChanged = super.get(key) !== value;
        const result = super.set(key, value);
        if (hasChanged || hadNoKey) {
            batch(() => {
                if (hadNoKey) {
                    this.#keyTriggers.dirty($OBJECT);
                    this.#keyTriggers.dirty(key);
                }
                if (hasChanged) {
                    this.#valueTriggers.dirty($OBJECT);
                    this.#valueTriggers.dirty(key);
                }
            });
        }
        return result;
    }
    delete(key) {
        const isDefined = super.get(key) !== undefined;
        const result = super.delete(key);
        if (result) {
            batch(() => {
                this.#keyTriggers.dirty($OBJECT);
                this.#valueTriggers.dirty($OBJECT);
                this.#keyTriggers.dirty(key);
                if (isDefined) {
                    this.#valueTriggers.dirty(key);
                }
            });
        }
        return result;
    }
    clear() {
        if (super.size === 0)
            return;
        batch(() => {
            this.#keyTriggers.dirty($OBJECT);
            this.#valueTriggers.dirty($OBJECT);
            for (const key of super.keys()) {
                this.#keyTriggers.dirty(key);
                this.#valueTriggers.dirty(key);
            }
            super.clear();
        });
    }
}

function selectTool(tool_key) {
  const p_tool = PRIMITIVE_TOOL_MAP.get(tool_key);
  if (p_tool) {
    selectPrimitiveTool(p_tool);
    return;
  }
  const s_tool = SIMPLE_TOOL_MAP.get(tool_key);
  if (s_tool) {
    s_tool.execute();
    return;
  }
  console.warn(`No Tool Associated with icon: ${tool_key}`);
}
const TOOL_MAP = new ReactiveMap([]);
const SIMPLE_TOOL_MAP = /* @__PURE__ */new Map([]);
function registerSimpleTool(tool) {
  SIMPLE_TOOL_MAP.set(tool.icon, tool);
  TOOL_MAP.set(tool.icon, tool);
}
const PRIMITIVE_TOOL_MAP = /* @__PURE__ */new Map([]);
function registerPrimitiveTool(tool) {
  PRIMITIVE_TOOL_MAP.set(tool.icon, tool);
  TOOL_MAP.set(tool.icon, tool);
}
const KEYBOARD_HANDLER_ID = "tool_creator";
const KB_SHORTCUTS = [{
  execute: abortToolCreation,
  hotkey: new RegExp("Escape|Delete"),
  title: "Primitive Tool Abort Controller"
}];
let creationController = new AbortController();
const [activePrimitiveObj, setActivePrimitiveObj] = createSignal();
const [activePrimitiveTool, setActivePrimitiveTool] = createSignal();
function createPrimitiveTool(pane, generateTool, e) {
  const new_primitive = generateTool(pane, e);
  if (isPrimitive(new_primitive)) {
    setActivePrimitiveObj(new_primitive);
  } else {
    finalizeToolCreation();
  }
  creationController.abort();
  creationController = new AbortController();
}
function abortToolCreation() {
  creationController.abort();
  creationController = new AbortController();
  let active_tool = activePrimitiveTool();
  if (active_tool) {
    active_tool.cleanup();
    setActivePrimitiveTool(void 0);
  }
  let active_tool_obj = activePrimitiveObj();
  if (active_tool_obj) active_tool_obj.remove();
  finalizeToolCreation();
}
function finalizeToolCreation() {
  setActivePrimitiveObj(void 0);
  setActivePrimitiveTool(void 0);
  KeyboardCTX().detachHandler(KEYBOARD_HANDLER_ID);
}
function selectPrimitiveTool(tool) {
  abortToolCreation();
  const ToolGenerator = tool.create;
  const EventType = tool.eventType ?? "mousedown";
  if (window.activeContainer === void 0 || ToolGenerator === void 0) return;
  window.activeContainer.frames.forEach(frame => {
    if (!isChartingFrame(frame)) return;
    frame.panes().forEach(pane => {
      pane._chartEl?.addEventListener(EventType, e => createPrimitiveTool(pane, ToolGenerator, e), {
        signal: creationController.signal
      });
      setActivePrimitiveTool(tool);
    });
  });
  if (!activePrimitiveTool()) return;
  KeyboardCTX().attachHandler(KEYBOARD_HANDLER_ID, KB_SHORTCUTS);
}

let mouseMoveController$1 = new AbortController();
function cleanUpOnePointTool() {
  mouseMoveController$1.abort();
}
function configureOnePointPrimitiveUI(e, new_primitive) {
  let p = new_primitive.series.coordinateToPrice(e.offsetY);
  let t = new_primitive.chart.timeScale().coordinateToTime(e.offsetX);
  if (t === null || p === null) {
    new_primitive.remove();
    console.warn("Failed to create Primitive, Price or Time invalid", new_primitive);
    return null;
  }
  new_primitive.updateData({
    p1: {
      time: t,
      value: p
    }
  });
  if (KeyboardCTX().ctrl()) {
    return null;
  }
  mouseMoveController$1 = new AbortController();
  const timescale = new_primitive.chart.timeScale();
  const bound_update_ref = updatePoint.bind(new_primitive, timescale);
  new_primitive.chart.subscribeCrosshairMove(bound_update_ref);
  mouseMoveController$1.signal.addEventListener("abort", () => {
    new_primitive.chart.unsubscribeCrosshairMove(bound_update_ref);
  }, {
    once: true
  });
  document.addEventListener("click", () => {
    new_primitive.chart.chartElement().addEventListener("click", confirmPoint, {
      signal: mouseMoveController$1.signal
    });
  }, {
    once: true
  });
  return new_primitive;
}
function confirmPoint(e) {
  if (e.button !== 0) return;
  cleanUpOnePointTool();
  finalizeToolCreation();
}
function updatePoint(timescale, param) {
  if (!param.point) return;
  let t = timescale.coordinateToTime(param.point.x);
  let p = this.series.coordinateToPrice(param.point.y);
  if (t && p) this.updateData({
    p1: {
      time: t,
      value: p
    }
  });
}

const TOOL_NAME$1 = "Horizontal Ray";
const HorizRayTool = {
  icon: icons.horiz_ray,
  label: TOOL_NAME$1,
  create: createRay,
  cleanup: cleanUpOnePointTool
};
function createRay(pane, e) {
  const new_line = new HorizRay("", {
    p1: null
  });
  pane._attachSeriesPrimitive(new_line);
  return configureOnePointPrimitiveUI(e, new_line);
}
const defaultOptions$1 = {
  right: true,
  ...DEFAULT_PRIMITIVE_OPTS,
  ...DEFAULT_STROKE_STYLE
};
class HorizRay extends OnePointPrimitive {
  constructor(id, params) {
    const _filled_params = {
      p1: params.p1,
      options: {
        ...defaultOptions$1,
        ...params.options
      }
    };
    super(id, TOOL_NAME$1, HorizRayRenderer, _filled_params);
  }
}
class HorizRayRenderer extends OnePointRenderer {
  draw(target) {
    target.useMediaCoordinateSpace(scope => {
      const ctx = scope.context;
      this.ctx = ctx;
      if (this._p1 === null) {
        this.stroke = null;
      } else {
        setCanvasStokeStyle(ctx, this.options);
        let line = new Path2D();
        line.moveTo(this._p1.x, this._p1.y);
        line.lineTo(this.options.right ? ctx.canvas.width + 1 : -1, this._p1.y);
        ctx.stroke(line);
        if (this._hovered !== void 0 || this._source.selected()) {
          draw_dot(ctx, this._p1, this._source.selected());
        }
        this.stroke = line;
      }
    });
  }
  hitTest(x, y) {
    if (!this._source._options.tangible || !this._source._options.visible || this._p1 === null) return null;
    this._hovered = void 0;
    if (this.options.right ? this._p1.x - 10 > x : this._p1.x + 10 < x) return null;
    if (Math.abs(this._p1.x - x) < 10 && Math.abs(this._p1.y - y) < 10) {
      this._hovered = HIT_RESULT.P1;
      return {
        cursorStyle: "grab",
        externalId: this._source,
        zOrder: "normal"
      };
    }
    if (Math.abs(this._p1.y - y) < Math.max(this.options.width, 8)) {
      this._hovered = HIT_RESULT.Stroke;
      return {
        cursorStyle: "grab",
        externalId: this._source,
        zOrder: "normal"
      };
    }
    return null;
  }
}

class TwoPointPrimitive extends PrimitiveBase {
  _p1;
  _p2;
  _options;
  _paneView;
  constructor(id, type, renderer, params) {
    super(id, type, void 0);
    this._options = params.options;
    this._p1 = params.p1;
    this._p2 = params.p2;
    this._paneView = new renderer(this);
  }
  updateData(params) {
    if (params.p1) this._p1 = params.p1;
    if (params.p2) this._p2 = params.p2;
    this.applyOptions(params.options);
    if (params.p1 || params.p2) this.requestUpdate();
  }
  //#region --------------- Base Class / Interface Functions --------------- //
  paneViews() {
    return [this._paneView];
  }
  updateAllViews() {
    this._paneView.update();
  }
  autoscaleInfo(startTimePoint, endTimePoint) {
    if (!this._options.autoscale || !this._options.visible) return null;
    if (this._p1 === null || this._p2 === null) return null;
    const p1Index = this.timeToIndex(this._p1.time);
    const p2Index = this.timeToIndex(this._p2.time);
    if (p1Index === null || p2Index === null) return null;
    if (p1Index < startTimePoint && p2Index < startTimePoint) return null;
    if (p1Index > endTimePoint && p2Index > endTimePoint) return null;
    return {
      priceRange: {
        minValue: Math.min(this._p1.value, this._p2.value),
        maxValue: Math.max(this._p1.value, this._p2.value)
      }
    };
  }
  hitTest(x, y) {
    return this._paneView.hitTest(x, y);
  }
  /* Move P1, P2, or both */
  onMouseDown(param) {
    if (!this._options.visible || !this._options.tangible) return;
    if (!param.sourceEvent || !param.logical) return;
    let update_func;
    if (this._paneView._hovered == HIT_RESULT.Stroke) {
      update_func = this._mouseMoveWholeLine.bind(this, {
        x: param.logical,
        y: param.sourceEvent.localY
      });
    } else if (this._paneView._hovered == HIT_RESULT.P1) {
      update_func = this._mouseMoveEndPoint.bind(this, true);
    } else if (this._paneView._hovered == HIT_RESULT.P2) {
      update_func = this._mouseMoveEndPoint.bind(this, false);
    } else return;
    const chart = this.chart;
    const pressedMove = chart.options().handleScroll.valueOf();
    const pressedMoveReEnable = typeof pressedMove == "boolean" ? pressedMove : pressedMove.pressedMouseMove;
    chart.applyOptions({
      handleScroll: {
        pressedMouseMove: false
      }
    });
    update_func = update_func.bind(this);
    chart.subscribeCrosshairMove(update_func);
    document.addEventListener("mouseup", () => {
      chart.unsubscribeCrosshairMove(update_func);
      chart.applyOptions({
        handleScroll: {
          pressedMouseMove: pressedMoveReEnable
        }
      });
    }, {
      once: true
    });
  }
  _mouseMoveEndPoint(p1, param) {
    if (!param.sourceEvent) return;
    let t = this.chart.timeScale().coordinateToTime(param.sourceEvent.localX);
    let p = this.series.coordinateToPrice(param.sourceEvent.localY);
    if (t && p) if (p1) this.updateData({
      p1: {
        time: t,
        value: p
      },
      p2: null
    });else this.updateData({
      p1: null,
      p2: {
        time: t,
        value: p
      }
    });
  }
  _mouseMoveWholeLine(last_point, param) {
    if (!param.logical || !param.sourceEvent || !this._p1 || !this._p2) return;
    let dx = param.logical - last_point.x;
    let dy = param.sourceEvent.localY - last_point.y;
    let p1 = this.movePoint(this._p1, dx, dy);
    let p2 = this.movePoint(this._p2, dx, dy);
    if (!p1 || !p2) return;
    this.updateData({
      p1,
      p2
    });
    last_point.x = param.logical;
    last_point.y = param.sourceEvent.localY;
  }
  //#endregion
}
class TwoPointRenderer {
  _p1 = null;
  _p2 = null;
  _source;
  _hovered;
  line = null;
  ctx = null;
  constructor(source) {
    this._source = source;
  }
  get options() {
    return this._source._options;
  }
  renderer() {
    return this;
  }
  update() {
    if (this._source._p1 === null || this._source._p2 === null) return;
    const series = this._source.series;
    const timeScale = this._source.chart.timeScale();
    let y1 = series.priceToCoordinate(this._source._p1.value);
    let y2 = series.priceToCoordinate(this._source._p2.value);
    let x1 = timeScale.timeToCoordinate(this._source._p1.time);
    let x2 = timeScale.timeToCoordinate(this._source._p2.time);
    if (x1 === null) x1 = this._source.nearestBarCoordinate(this._source._p1.time);
    if (x2 === null) x2 = this._source.nearestBarCoordinate(this._source._p2.time);
    if (x1 === null || x2 === null || y1 === null || y2 === null) {
      this._p1 = null;
      this._p2 = null;
      return;
    }
    this._p1 = {
      x: Math.round(x1),
      y: Math.round(y1)
    };
    this._p2 = {
      x: Math.round(x2),
      y: Math.round(y2)
    };
  }
}

let mouseMoveController = new AbortController();
function cleanUpTwoPointTool() {
  mouseMoveController.abort();
}
function configureTwoPointPrimitiveUI(e, new_primitive) {
  let p = new_primitive.series.coordinateToPrice(e.offsetY);
  let t = new_primitive.chart.timeScale().coordinateToTime(e.offsetX);
  if (t === null || p === null) {
    new_primitive.remove();
    console.warn("Failed to create Primitive, Price or Time invalid", new_primitive);
    return null;
  }
  new_primitive.updateData({
    p1: {
      time: t,
      value: p
    },
    p2: {
      time: t,
      value: p
    }
  });
  mouseMoveController = new AbortController();
  const timescale = new_primitive.chart.timeScale();
  const bound_update_ref = updateSecondPoint.bind(new_primitive, timescale);
  new_primitive.chart.subscribeCrosshairMove(bound_update_ref);
  mouseMoveController.signal.addEventListener("abort", () => {
    new_primitive.chart.unsubscribeCrosshairMove(bound_update_ref);
  }, {
    once: true
  });
  document.addEventListener("click", () => {
    new_primitive.chart.chartElement().addEventListener("click", confirmSecondPoint, {
      signal: mouseMoveController.signal
    });
  }, {
    once: true
  });
  return new_primitive;
}
function confirmSecondPoint(e) {
  if (e.button !== 0) return;
  cleanUpTwoPointTool();
  finalizeToolCreation();
}
function updateSecondPoint(timescale, param) {
  if (!param.point) return;
  let t = timescale.coordinateToTime(param.point.x);
  let p = this.series.coordinateToPrice(param.point.y);
  if (t && p) this.updateData({
    p1: null,
    p2: {
      time: t,
      value: p
    }
  });
}

const TOOL_NAME = "Trend Line";
const TrendLineTool = {
  icon: icons.trend_line,
  label: TOOL_NAME,
  create: createTrendLine,
  cleanup: cleanUpTwoPointTool
};
function createTrendLine(pane, e) {
  const new_line = new TrendLine("", {
    p1: null,
    p2: null
  });
  pane._attachSeriesPrimitive(new_line);
  return configureTwoPointPrimitiveUI(e, new_line);
}
const defaultOptions = {
  ...DEFAULT_PRIMITIVE_OPTS,
  ...DEFAULT_STROKE_STYLE
};
class TrendLine extends TwoPointPrimitive {
  constructor(id, params) {
    const _filled_params = {
      p1: params.p1,
      p2: params.p2,
      options: {
        ...defaultOptions,
        ...params.options
      }
    };
    super(id, TOOL_NAME, TrendLineRenderer, _filled_params);
  }
}
class TrendLineRenderer extends TwoPointRenderer {
  draw(target) {
    target.useMediaCoordinateSpace(scope => {
      const ctx = scope.context;
      this.ctx = ctx;
      if (this._p1 === null || this._p2 === null) {
        this.line = null;
      } else {
        setCanvasStokeStyle(ctx, this.options);
        let line = new Path2D();
        line.moveTo(this._p1.x, this._p1.y);
        line.lineTo(this._p2.x, this._p2.y);
        ctx.stroke(line);
        if (this._hovered !== void 0 || this._source.selected()) {
          draw_dot(ctx, this._p1, this._source.selected());
          draw_dot(ctx, this._p2, this._source.selected());
        }
        this.line = line;
      }
    });
  }
  hitTest(x, y) {
    if (!this._source._options.tangible || !this._source._options.visible || this.line === null || this.ctx === null || this._p1 === null || this._p2 === null) return null;
    this._hovered = void 0;
    if (!(
    //Course X range Check
    x + 10 > this._p1.x && x - 10 < this._p2.x || x - 10 < this._p1.x && x + 10 > this._p2.x)) return null;
    if (!(
    //Course Y range Check
    y + 10 > this._p1.y && y - 10 < this._p2.y || y - 10 < this._p1.y && y + 10 > this._p2.y)) return null;
    if (Math.abs(this._p1.x - x) < 10 && Math.abs(this._p1.y - y) < 10) {
      this._hovered = HIT_RESULT.P1;
      return {
        cursorStyle: "grab",
        externalId: this._source,
        zOrder: "normal"
      };
    }
    if (Math.abs(this._p2.x - x) < 10 && Math.abs(this._p2.y - y) < 10) {
      this._hovered = HIT_RESULT.P2;
      return {
        cursorStyle: "grab",
        externalId: this._source,
        zOrder: "normal"
      };
    }
    this.ctx.lineWidth = Math.max(this._source._options.width, 6);
    if (this.ctx.isPointInStroke(this.line, x, y)) {
      this._hovered = HIT_RESULT.Stroke;
      return {
        cursorStyle: "grab",
        externalId: this._source,
        zOrder: "normal"
      };
    }
    return null;
  }
}

const primitives = /* @__PURE__ */new Map([["TrendLine", TrendLine], ["HorizRay", HorizRay]]);
registerSimpleTool(DotCursor);
registerSimpleTool(ArrowCursor);
registerSimpleTool(CrosshairCursor);
registerPrimitiveTool(HorizRayTool);
registerPrimitiveTool(TrendLineTool);

const MAIN_TIMESERIES_ID = "i_XyzZy";
const INDICATOR = Symbol("Indicator");
function isIndicator(obj) {
  return obj !== null && typeof obj === "object" && INDICATOR in obj;
}
class indicator {
  [INDICATOR] = true;
  [ORDERABLE] = true;
  [ORDERABLE_SET] = true;
  _id;
  _type;
  _name;
  _pane;
  _frame;
  visibilitySignal;
  labelHtml;
  setLabelHtml;
  outputs;
  menuId;
  menuStruct;
  options;
  setOptions;
  attached;
  setAttached;
  series = /* @__PURE__ */new Map();
  primitives = /* @__PURE__ */new Map();
  visibilityMemory = /* @__PURE__ */new Map();
  leafProps;
  branchProps;
  constructor(id, type, display_name, outputs, frame) {
    this._id = id;
    this._type = type;
    this._name = display_name;
    this._pane = frame.default_pane;
    this._frame = frame;
    this.outputs = outputs;
    this.visibilitySignal = createSignal(true);
    const options_store = createStore({});
    this.options = options_store[0];
    this.setOptions = options_store[1];
    const orderables = createSignal([]);
    this.attached = orderables[0];
    this.setAttached = orderables[1];
    const labelHtml = createSignal(void 0);
    this.labelHtml = labelHtml[0];
    this.setLabelHtml = labelHtml[1];
    this.pane.attach(this);
    this.leafProps = {
      id: this.id,
      leafTitle: this.name,
      obj: this
    };
    this.branchProps = {
      id: this.id,
      branchTitle: this.name,
      dropDownMode: "toggleable",
      reorderables: this.attached,
      reorder: this.reorder.bind(this),
      moveTo: () => {}
    };
  }
  setLabel(label) {
    this.setLabelHtml(label !== "" ? label : void 0);
  }
  // TODO: Implement
  move_to_pane(pane_index) {}
  delete() {
    this.series.forEach((ser, key) => {
      ser.remove();
    });
    this.primitives.forEach((prim, key) => {
      this.pane.paneApi.detachPrimitive(prim);
    });
    this.pane.detach(this);
  }
  setVisibility(arg) {
    this.visibilitySignal[1](arg);
    const _maps = [this.series, this.primitives];
    for (let i = 0; i < _maps.length; i++) if (arg) for (const [k, v] of _maps[i].entries()) {
      v.applyOptions({
        visible: this.visibilityMemory.get(k) ?? true
      });
    } else for (const [k, v] of _maps[i].entries()) {
      this.visibilityMemory.set(k, v.options().visible);
      v.applyOptions({
        visible: false
      });
    }
  }
  reorder(from, to) {
    console.log(`Reorder Series from: ${from}, to: ${to}`);
  }
  get id() {
    return this._id;
  }
  get index() {
    return 0;
  }
  get length() {
    return 0;
  }
  get type() {
    return this._type;
  }
  get pane() {
    return this._pane;
  }
  get frame() {
    return this._frame;
  }
  get name() {
    return this._name ? this._name : this.type;
  }
  get removable() {
    return this._id !== MAIN_TIMESERIES_ID;
  }
  //#region ------------------------ Python Interface ------------------------ //
  //Functions marked as protected are done so it indicate the original intent
  //only encompassed being called from python, not from within JS.
  add_series(_id, _type, _name = void 0) {
    const _ser = new SeriesBase(_id, _name, _type, this);
    this.series.set(_id, _ser);
    this.setAttached([...this.attached(), _ser]);
  }
  remove_series(_id) {
    let series = this.series.get(_id);
    if (series === void 0) return;
    series.remove();
    this.series.delete(_id);
    this.setAttached(this.attached().filter(_ser => _ser !== series));
  }
  add_primitive(_id, _type, params) {
    let primitive_type = primitives.get(_type);
    if (primitive_type === void 0) return;
    let new_obj = new primitive_type(this._id + _id, params);
    this.primitives.set(_id, new_obj);
    this._frame.whitespace_series.attachPrimitive(new_obj);
  }
  remove_primitive(_id) {
    let _obj = this.primitives.get(_id);
    if (_obj === void 0) return;
    this._frame.whitespace_series.detachPrimitive(_obj);
    this.primitives.delete(_id);
  }
  update_primitive(_id, params) {
    this.primitives.get(_id)?.updateData(params);
  }
  applyOptions(options, externalCall = false) {
    this.setOptions(options);
    if (!externalCall) window.api.set_indicator_options(this._frame.id.substring(0, 6),
    // Container ID
    this._frame.id.substring(0, 13),
    // Frame ID
    this.id, options);
  }
  set_menu_struct(menu_struct, options) {
    this.menuStruct = menu_struct;
    this.setOptions(options);
  }
  //#endregion
  displayOptionsMenu() {
    generateOptionsMenu({
      id: `${this._frame.id}_${this._id}_options`,
      options: this.options,
      on_submit: this.applyOptions.bind(this),
      title: this.type + " • " + this.name + (this.name !== "" ? " • " : "") + "Options",
      tabs: {
        "Inputs": this.menuStruct,
        "Style": () => MultipleSeriesStyleEditor({
          series: this.series
        })
      }
    });
  }
}

const MIN_PANE_HEIGHT = 30;
class charting_pane {
  [ORDERABLE] = true;
  [ORDERABLE_SET] = true;
  _pane;
  _frame;
  paneEl;
  setPaneEl;
  series_primitives;
  attached;
  setAttached;
  stretchFactorMemory = 1;
  maximized;
  setMaximized;
  minimized;
  setMinimized;
  leafProps;
  branchProps;
  shortcuts;
  ctxMenuStruct;
  ctxMenuCleaner = new AbortController();
  constructor(frame, pane) {
    this._pane = pane;
    this._frame = frame;
    this.series_primitives = new PrimitiveSet(this);
    const sig1 = createSignal();
    this.paneEl = sig1[0];
    this.setPaneEl = sig1[1];
    const sig2 = createSignal([]);
    this.attached = sig2[0];
    this.setAttached = sig2[1];
    const sig3 = createSignal(false);
    this.maximized = sig3[0];
    this.setMaximized = sig3[1];
    const sig4 = createSignal(false);
    this.minimized = sig4[0];
    this.setMinimized = sig4[1];
    this.leafProps = {
      obj: this,
      id: this.id,
      leafTitle: this.name
    };
    this.branchProps = {
      id: this.id,
      branchTitle: this.name,
      dropDownMode: "always",
      reorderables: this.attached,
      moveTo: this.moveToPane.bind(this),
      reorder: this.reorderAttached.bind(this)
    };
    this.ctxMenuStruct = generateContextMenuStruct$1(this);
    this.shortcuts = deriveShortcuts(this.ctxMenuStruct);
  }
  onActivation() {
    console.log("activate pane", this.paneIndex);
    KeyboardCTX().attachHandler(this.id, this.shortcuts);
  }
  onDeactivation() {
    console.log("deactivate pane", this.paneIndex);
    KeyboardCTX().detachHandler(this.id);
  }
  get id() {
    return String(this._pane.paneIndex());
  }
  get name() {
    return "Pane #" + String(this.id);
  }
  get frame() {
    return this._frame;
  }
  get paneIndex() {
    return this._pane.paneIndex();
  }
  get paneApi() {
    return this._pane;
  }
  get _paneEl() {
    if (this._pane.getHTMLElement()) return this._pane.getHTMLElement();
  }
  get _leftAxisEl() {
    const _el = this._pane.getHTMLElement()?.querySelector("td:nth-child(1)");
    if (_el) return _el;
  }
  get _chartEl() {
    const _el = this._pane.getHTMLElement()?.querySelector("td:nth-child(2)");
    if (_el) return _el;
  }
  get _rightAxisEl() {
    const _el = this._pane.getHTMLElement()?.querySelector("td:nth-child(3)");
    if (_el) return _el;
  }
  _updatePaneEl() {
    requestAnimationFrame(() => {
      this.setPaneEl(this._paneEl);
      this._recordStretchFactor();
      this.ctxMenuCleaner.abort();
      this.ctxMenuCleaner = new AbortController();
      this._paneEl?.addEventListener("contextmenu", MenuContextListener.bind(this.ctxMenuStruct), {
        signal: this.ctxMenuCleaner.signal,
        capture: true
      });
    });
  }
  movePane(index) {
    if (index === this.paneIndex) return;
    this._frame.reorderPanes(this.paneIndex, index);
  }
  _recordStretchFactor() {
    this.stretchFactorMemory = this.paneApi.getStretchFactor();
  }
  _minimizePane() {
    this.paneApi.setHeight(MIN_PANE_HEIGHT);
    this.setMaximized(false);
    this.setMinimized(true);
  }
  _restorePane() {
    this.paneApi.setStretchFactor(this.stretchFactorMemory);
    this.setMaximized(false);
    this.setMinimized(false);
  }
  _maximizePane() {
    this.paneApi.setStretchFactor(1);
    this.setMaximized(true);
    this.setMinimized(false);
  }
  _hidePane() {
    this.paneApi.setStretchFactor(0);
    this.setMaximized(false);
    this.setMinimized(true);
  }
  // TODO: Expand this functionality to match primitive base if pane Primitives become more readily used.
  _attachPanePrimitive(primitive) {
    this._pane.attachPrimitive(primitive);
  }
  _detachPanePrimitive(primitive) {
    this._pane.detachPrimitive(primitive);
  }
  _attachSeriesPrimitive(primitive) {
    this.series_primitives?.attachPrimitive(primitive);
  }
  _detachSeriesPrimitive(primitive) {
    this.series_primitives?.detachPrimitive(primitive);
  }
  _addSeries(type) {
    return this._pane.addSeries(type);
  }
  _addCustomSeries(impl) {
    return this._pane.addCustomSeries(impl);
  }
  _priceScale(scale) {
    return this._pane.priceScale(scale);
  }
  indicators() {
    return this.attached().filter(obj => isIndicator(obj));
  }
  primitiveSets() {
    return this.attached().filter(obj => isPrimitiveSet(obj));
  }
  attach(obj) {
    this.setAttached([...this.attached(), obj]);
  }
  detach(obj) {
    this.setAttached([...this.attached().filter(_obj => _obj !== obj)]);
  }
  reorderAttached(from, to) {
    console.log(`Reorder Indicators: from: ${from}, to: ${to}`);
  }
  moveToPane(obj) {}
}
function generateContextMenuStruct$1(pane) {
  return [[{
    icon: icons.menu_arrow_sn,
    title: "Move Pane Up",
    execute: () => pane.movePane(pane.paneIndex - 1),
    disable: () => pane.paneIndex === 0,
    ctrl: true,
    hotkey: "ArrowUp"
  }, {
    icon: icons.menu_arrow_ns,
    title: "Move Pane Down",
    execute: () => pane.movePane(pane.paneIndex + 1),
    disable: () => pane.paneIndex === pane.frame.panes().length - 1,
    ctrl: true,
    hotkey: "ArrowDown"
  }]];
}

var _tmpl$$d = /* @__PURE__ */template(`<div class=frame_ruler>`),
  _tmpl$2$8 = /* @__PURE__ */template(`<div class=pane_controls>`),
  _tmpl$3$3 = /* @__PURE__ */template(`<div class=scale_buttons>`),
  _tmpl$4$3 = /* @__PURE__ */template(`<div class=pane_tools>`),
  _tmpl$5$3 = /* @__PURE__ */template(`<div class=pane_legend><div class=legend_toggle_btn>`),
  _tmpl$6$2 = /* @__PURE__ */template(`<div class=ind_tag>Undefined Indicator`),
  _tmpl$7$2 = /* @__PURE__ */template(`<div class=ind_tag><div class=text>`);
function ChartFrame(props) {
  const [, passDown] = splitProps(props, ["setRulerRef"]);
  return [memo(() => props.frame.chart_el), createComponent(Index, {
    get each() {
      return props.frame.panes();
    },
    children: pane => createComponent(ChartPaneOverlay, mergeProps({
      get pane() {
        return pane();
      }
    }, passDown))
  }), (() => {
    var _el$ = _tmpl$$d();
    var _ref$ = props.setRulerRef;
    typeof _ref$ === "function" ? use(_ref$, _el$) : props.setRulerRef = _el$;
    return _el$;
  })()];
}
function ChartPaneOverlay(props) {
  const [show, setShow] = createSignal(true);
  const [toolsRef, setToolsRef] = createSignal();
  const [leftAxis, setLeftAxis] = createSignal();
  const [rightAxis, setRightAxis] = createSignal();
  const [toolsStyle, setToolsStyle] = createSignal({});
  const [legendStyle, setLegendStyle] = createSignal({});
  const [leftScaleStyle, setLeftScaleStyle] = createSignal({});
  const [rightScaleStyle, setRightScaleStyle] = createSignal({});
  const _reposition = () => {
    let cell_ref;
    if (cell_ref = props.pane._paneEl) {
      if (cell_ref.offsetHeight <= MIN_PANE_HEIGHT) {
        cell_ref.style.opacity = "0";
        props.pane.setMinimized(true);
      } else {
        cell_ref.style.opacity = "1";
        props.pane.setMinimized(false);
      }
      if (show() && cell_ref.offsetHeight < MIN_PANE_HEIGHT) setShow(false);else if (!show() && cell_ref.offsetHeight > MIN_PANE_HEIGHT) setShow(true);
    }
    if (cell_ref = props.pane._chartEl) {
      setLegendStyle({
        top: `${cell_ref.offsetTop + 3}px`,
        left: `${cell_ref.offsetLeft + 8}px`
      });
      setToolsStyle({
        top: `${cell_ref.offsetTop}px`,
        left: `${cell_ref.offsetLeft + cell_ref.offsetWidth - 8 - (toolsRef()?.offsetWidth ?? 0)}px`
      });
    }
    if (cell_ref = props.pane._leftAxisEl) setLeftScaleStyle({
      top: `${cell_ref.offsetTop + 12}px`,
      left: `${cell_ref.offsetLeft + (cell_ref.offsetWidth / 2 - 14)}px`
    });
    if (cell_ref = props.pane._rightAxisEl) setRightScaleStyle({
      top: `${cell_ref.offsetTop + 12}px`,
      left: `${cell_ref.offsetLeft + (cell_ref.offsetWidth / 2 - 14)}px`
    });
  };
  const watcher = new MutationObserver(_reposition);
  onCleanup(watcher.disconnect);
  createEffect(on$1(props.pane.paneEl, () => {
    watcher.disconnect();
    const el = props.pane._chartEl;
    if (el) watcher.observe(el, {
      attributeFilter: ["style"]
    });
    setLeftAxis(props.pane._leftAxisEl);
    setRightAxis(props.pane._rightAxisEl);
    requestAnimationFrame(_reposition);
  }));
  createEffect(on$1(props.frame.panes, () => requestAnimationFrame(_reposition)));
  return (() => {
    var _el$2 = _tmpl$2$8();
    insert(_el$2, createComponent(ScaleToggle, mergeProps(props, {
      pricescale: "left",
      axis_ref: leftAxis,
      style: leftScaleStyle
    })), null);
    insert(_el$2, createComponent(PaneLegend, mergeProps(props, {
      style: legendStyle
    })), null);
    insert(_el$2, createComponent(PaneTools, mergeProps(props, {
      style: toolsStyle,
      setDivRef: setToolsRef
    })), null);
    insert(_el$2, createComponent(ScaleToggle, mergeProps(props, {
      pricescale: "right",
      axis_ref: rightAxis,
      style: rightScaleStyle
    })), null);
    createRenderEffect(_$p => (_$p = show() ? void 0 : "none") != null ? _el$2.style.setProperty("display", _$p) : _el$2.style.removeProperty("display"));
    return _el$2;
  })();
}
function ScaleToggle(props) {
  let rendered_height = 45;
  let divRef = document.createElement("div");
  const _getPriceScale = () => props.pane._priceScale(props.pricescale);
  const [show, setShow] = createSignal(false);
  const [mode, setMode] = createSignal(_getPriceScale()?.options()?.mode ?? 0);
  const [invert, setInvert] = createSignal(_getPriceScale()?.options()?.invertScale ?? false);
  let event_cleaner = new AbortController();
  createEffect(() => {
    const axis_ref = props.axis_ref();
    if (axis_ref === void 0) return;
    event_cleaner.abort();
    event_cleaner = new AbortController();
    axis_ref.addEventListener("mouseleave", e => {
      if (!divRef.contains(e.relatedTarget)) setShow(false);
    }, {
      signal: event_cleaner.signal
    });
    axis_ref.addEventListener("mouseenter", () => {
      if (axis_ref.offsetHeight >= rendered_height) setShow(true);
      setMode(_getPriceScale()?.options()?.mode ?? 0);
      setInvert(_getPriceScale()?.options()?.invertScale ?? false);
    }, {
      signal: event_cleaner.signal
    });
  });
  createEffect(on$1(show, () => {
    rendered_height = Math.max(divRef.offsetHeight ?? 0, rendered_height);
  }));
  onCleanup(event_cleaner.abort);
  createEffect(() => {
    _getPriceScale()?.applyOptions({
      mode: mode()
    });
  });
  createEffect(() => {
    _getPriceScale()?.applyOptions({
      invertScale: invert()
    });
  });
  const setModeEnsured = new_mode => setMode(mode() !== new_mode ? new_mode : 0);
  return createComponent(Show, {
    get when() {
      return show();
    },
    get children() {
      var _el$3 = _tmpl$3$3();
      var _ref$2 = divRef;
      typeof _ref$2 === "function" ? use(_ref$2, _el$3) : divRef = _el$3;
      insert(_el$3, createComponent(TextIcon, {
        text: "L",
        get activated() {
          return mode() === 1;
        },
        onClick: () => setModeEnsured(1),
        classList: {
          icon_text: false,
          scale_icon_text: true
        }
      }), null);
      insert(_el$3, createComponent(TextIcon, {
        text: "I",
        get activated() {
          return invert();
        },
        onClick: () => setInvert(!invert()),
        classList: {
          icon_text: false,
          scale_icon_text: true
        }
      }), null);
      createRenderEffect(_$p => style(_el$3, props.style(), _$p));
      return _el$3;
    }
  });
}
function PaneTools(props) {
  const [moveUp, setMoveUp] = createSignal(props.pane.paneIndex !== 0);
  const [moveDown, setMoveDown] = createSignal(props.pane.paneIndex !== props.frame.panes().length - 1);
  createEffect(on$1([props.pane.paneEl, props.frame.panes], () => {
    setMoveUp(props.pane.paneIndex !== 0);
    setMoveDown(props.pane.paneIndex !== props.frame.panes().length - 1);
  }));
  return (() => {
    var _el$4 = _tmpl$4$3();
    var _ref$3 = props.setDivRef;
    typeof _ref$3 === "function" ? use(_ref$3, _el$4) : props.setDivRef = _el$4;
    insert(_el$4, createComponent(Icon, {
      get icon() {
        return icons.window_add;
      },
      width: 12,
      height: 16,
      onClick: () => props.frame.addPane(),
      classList: {
        icon_text: false,
        pane_tools_icon: true
      }
    }), null);
    insert(_el$4, createComponent(Show, {
      get when() {
        return props.frame.panes().length - 1;
      },
      keyed: true,
      get children() {
        return [createComponent(Icon, {
          when: moveUp,
          get icon() {
            return icons.menu_arrow_sn;
          },
          width: 12,
          height: 16,
          viewBox: "-8 -4 32 16",
          onClick: () => props.pane.movePane(props.pane.paneIndex - 1),
          classList: {
            icon_text: false,
            pane_tools_icon: true
          }
        }), createComponent(Icon, {
          when: moveDown,
          get icon() {
            return icons.menu_arrow_ns;
          },
          width: 12,
          height: 16,
          viewBox: "-8 -4 32 16",
          onClick: () => props.pane.movePane(props.pane.paneIndex + 1),
          classList: {
            icon_text: false,
            pane_tools_icon: true
          }
        }), createComponent(Icon, {
          when: () => !props.pane.maximized(),
          get icon() {
            return icons.maximize;
          },
          width: 12,
          height: 16,
          onClick: () => props.frame.maximizePane(props.pane),
          classList: {
            icon_text: false,
            pane_tools_icon: true
          }
        }), createComponent(Icon, {
          when: () => props.pane.minimized() || props.pane.maximized(),
          get icon() {
            return props.pane.minimized() ? icons.restore_alt : icons.restore;
          },
          width: 12,
          height: 16,
          onClick: () => props.frame.restorePanes(),
          classList: {
            icon_text: false,
            pane_tools_icon: true
          }
        }), createComponent(Icon, {
          when: () => props.pane !== props.frame.default_pane,
          get icon() {
            return icons.close;
          },
          width: 12,
          height: 16,
          viewBox: "-4 -4 26 26",
          onClick: () => console.log("delete pane"),
          classList: {
            icon_text: false,
            pane_tools_icon: true
          }
        })];
      }
    }), null);
    createRenderEffect(_$p => style(_el$4, props.style(), _$p));
    return _el$4;
  })();
}
function PaneLegend(props) {
  let legend_ref = document.createElement("div");
  const [show, setShow] = createSignal(true);
  createEffect(on$1([props.style, show], () => {
    if (show() && props.pane.paneApi.getHeight() < legend_ref.offsetHeight) setShow(false);
  }));
  return (() => {
    var _el$5 = _tmpl$5$3(),
      _el$6 = _el$5.firstChild;
    var _ref$4 = legend_ref;
    typeof _ref$4 === "function" ? use(_ref$4, _el$5) : legend_ref = _el$5;
    insert(_el$5, createComponent(Show, {
      get when() {
        return show();
      },
      get children() {
        return createComponent(For, {
          get each() {
            return props.pane.indicators();
          },
          children: indObj => {
            if (indObj === void 0) return _tmpl$6$2();
            return createComponent(IndicatorTag, {
              ind: indObj
            });
          }
        });
      }
    }), _el$6);
    _el$6.$$click = e => {
      if (e.button === 0) setShow(!show());
    };
    insert(_el$6, createComponent(Icon, {
      classList: {
        icon: false,
        icon_no_hover: true
      },
      get icon() {
        return show() ? icons.menu_arrow_sn : icons.menu_ext_small;
      },
      force_reload: true
    }));
    createRenderEffect(_$p => style(_el$5, props.style(), _$p));
    return _el$5;
  })();
}
const gearProps = {
  width: 16,
  height: 16
};
const closeProps = {
  width: 16,
  height: 16,
  viewBox: "-4 -4 26 26"
};
const eyeProps = {
  width: 20,
  height: 16,
  viewBox: "2 2 20 20"
};
function IndicatorTag(props) {
  const ind = props.ind;
  const [hover, setHover] = createSignal(false);
  let div = document.createElement("div");
  const stopPropagation = e => {
    e.stopPropagation();
  };
  onMount(() => div.addEventListener("mousedown", stopPropagation));
  onCleanup(() => div.removeEventListener("mousedown", stopPropagation));
  return (() => {
    var _el$8 = _tmpl$7$2(),
      _el$9 = _el$8.firstChild;
    _el$8.addEventListener("mouseleave", () => setHover(false));
    _el$8.addEventListener("mouseenter", () => setHover(true));
    var _ref$5 = div;
    typeof _ref$5 === "function" ? use(_ref$5, _el$8) : div = _el$8;
    insert(_el$8, createComponent(Show, {
      get when() {
        return hover();
      },
      get children() {
        return [createComponent(Icon, mergeProps(eyeProps, {
          get icon() {
            return ind.visibilitySignal[0]() ? icons.eye_normal : icons.eye_crossed;
          },
          onClick: e => {
            if (e.button === 0) ind.setVisibility(!ind.visibilitySignal[0]());
          }
        })), " ", createComponent(Icon, mergeProps({
          get icon() {
            return icons.settings_small;
          }
        }, gearProps, {
          onclick: e => {
            if (e.button === 0) ind.displayOptionsMenu();
          }
        })), " ", createComponent(Show, {
          get when() {
            return ind.removable;
          },
          get children() {
            return [createComponent(Icon, mergeProps({
              get icon() {
                return icons.close;
              }
            }, closeProps)), " "];
          }
        })];
      }
    }), null);
    createRenderEffect(() => _el$9.innerHTML = ind.name + (ind.labelHtml() !== void 0 ? " • " + ind.labelHtml() : ""));
    return _el$8;
  })();
}
delegateEvents(["click"]);

class frame {
  type = "abstract";
  _id;
  updateTab;
  element;
  active;
  setActive;
  target;
  setTarget;
  timeframe = void 0;
  ticker = void 0;
  constructor(id, updateFunc) {
    this._id = id;
    this.updateTab = updateFunc;
    const [target, setTarget] = createSignal(false);
    this.target = target;
    this.setTarget = setTarget;
    const [active, setActive] = createSignal(false);
    this.active = active;
    this.setActive = setActive;
  }
  get id() {
    return this._id;
  }
  refreshSize() {}
  onShow() {}
  //{console.log(`Show ${this.id}`)}
  onHide() {}
  //{console.log(`Hide ${this.id}`)}
  onActivation() {}
  //{console.log(`Activate ${this.id}`)}
  onDeactivation() {}
  //{console.log(`Deactivate ${this.id}`)}
  /**
   * Update Global 'active_frame' reference to this instance. 
   */
  assignActiveFrame() {
    if (window.activeFrame === this) return;
    if (window.activeFrame) {
      window.activeFrame.setActive(false);
      window.activeFrame.onDeactivation();
    }
    window.activeFrame = this;
    this.setActive(true);
    this.onActivation();
  }
}

const TYPE_STR = "charting_frame";
const isChartingFrame = frame2 => frame2.type === TYPE_STR;
class charting_frame extends frame {
  type = TYPE_STR;
  frameRuler;
  element;
  _chart;
  default_pane;
  whitespace_series;
  primitiveData;
  setPrimitiveData;
  _timescaleTimes;
  pane_map = /* @__PURE__ */new WeakMap();
  attached = /* @__PURE__ */new Map();
  eventDelegates = /* @__PURE__ */new Map();
  timeframe;
  ticker;
  series_type;
  shortcuts;
  ctxMenuStruct;
  objTreeBranch;
  panes;
  setPanes;
  // Used to track activity states to primarily keep the Keyboard listeners relevant
  _activePane;
  _activeSeries;
  _activePrimitive;
  constructor(id, tab_update_func) {
    super(id, tab_update_func);
    const [frameRuler, setFrameRulerRef] = createSignal(document.createElement("div"));
    this.frameRuler = frameRuler;
    const sig1 = createSignal([]);
    this.panes = sig1[0];
    this.setPanes = sig1[1];
    const sig2 = createSignal({
      time: "1970-01-01",
      value: 0
    });
    this.primitiveData = sig2[0];
    this.setPrimitiveData = sig2[1];
    this.ticker = {
      symbol: "FRACTA"
    };
    this.timeframe = new tf(1, "D");
    this.series_type = Series_Type.CANDLESTICK;
    const OPTS = DEFAULT_CHART_OPTS();
    let tmp_div = document.createElement("div");
    this._chart = Fn(tmp_div, OPTS);
    this.default_pane = this.addPane();
    this.whitespace_series = this._chart.addSeries(Jn);
    this.element = ChartFrame({
      frame: this,
      setRulerRef: setFrameRulerRef
    });
    this.objTreeBranch = {
      id: this.id,
      branchTitle: "",
      dropDownMode: "auto",
      reorderables: this.panes,
      reorder: this.reorderPanes.bind(this),
      moveTo: () => {}
    };
    this.ctxMenuStruct = generateContextMenuStruct(this);
    this.shortcuts = deriveShortcuts(this.ctxMenuStruct);
    this.chart_el?.addEventListener("contextmenu", this._onContextMenu.bind(this), {
      capture: true
    });
    this.subscribeMouseEvent("mousedown", this._onMouseDownEvent.bind(this));
    this.subscribeMouseEvent("click", this._onClickTypeEvents.bind(this, "click"));
    this.subscribeMouseEvent("dblclick", this._onClickTypeEvents.bind(this, "dblclick"));
    this.subscribeMouseEvent("auxclick", this._onClickTypeEvents.bind(this, "auxclick"));
    this.subscribeMouseEvent("mouseup", this._onClickTypeEvents.bind(this, "mouseup"));
    console.log(this);
    this.chart_el.addEventListener("mousedown", () => {
      this.updateTimescaleOpts({
        "shiftVisibleRangeOnNewBar": false,
        "allowShiftVisibleRangeOnWhitespaceReplacement": false,
        "rightBarStaysOnScroll": false
      });
    });
    window.document.addEventListener("mouseup", () => {
      this.updateTimescaleOpts({
        "shiftVisibleRangeOnNewBar": true,
        "allowShiftVisibleRangeOnWhitespaceReplacement": true,
        "rightBarStaysOnScroll": true
      });
    });
  }
  onActivation() {
    this.updateTab(this.ticker.symbol);
    window.topbar.setSeries(this.series_type);
    window.topbar.setTimeframe(this.timeframe);
    window.topbar.setTicker(this.ticker.symbol);
    ObjectTreeCTX().setMainBranch(this.objTreeBranch);
    KeyboardCTX().attachHandler(this.id, this.shortcuts);
  }
  onDeactivation() {
    ObjectTreeCTX().setMainBranch(NULL_TREE_BRANCH_INTERFACE);
    KeyboardCTX().detachHandler(this.id);
  }
  // #region -------------- Lightweight Charts API Related Functions ------------------ //
  get name() {
    return "";
  }
  get chart() {
    return this._chart;
  }
  get chart_el() {
    return this._chart.chartElement();
  }
  get paneAPIs() {
    return this._chart.panes();
  }
  // Cached Array of all the times (in UTC) in the timescale.
  get timescaleTimes() {
    return this._timescaleTimes;
  }
  // Updating the Cached timeseries reference alongside the whitespace *should* catch all Timescale datapoint
  // updates. The only way for it not to is if a user indicator sets a timepoint not already on the timescale
  // which in 99.999% of applications will be a bug since it will add a gap to the screen.
  updateTimescalePoints() {
    const _points = this.chart.timeScale().uh._D;
    this._timescaleTimes = _points && _points.length > 0 ? Array.from(_points, p => p.originalTime) : void 0;
  }
  refreshSize() {
    this._chart.resize(Math.max(this.frameRuler().clientWidth, 0), Math.max(this.frameRuler().clientHeight, 0), false);
  }
  fitContent() {
    this._chart.timeScale().fitContent();
  }
  autoscaleContent() {
    this._chart.timeScale().resetTimeScale();
  }
  applyChartOpts(newOpts) {
    this._chart.applyOptions(newOpts);
  }
  updateTimescaleOpts(newOpts) {
    this._chart.timeScale().applyOptions(newOpts);
  }
  // #endregion
  //#region -------------- Mouse Events ------------------ //
  _getMouseEventParams(index, pt, sourceEvent) {
    let renamed = {};
    Object.entries(this._chart.Wf.xw(index, pt, sourceEvent)).forEach(
    //@ts-ignore :: Rename from Minified keys => Actual Keys
    ([k, v]) => {
      renamed[MouseEventKeyMap[k]] = v;
    });
    return renamed;
  }
  _convertMouseEventParams(params) {
    return {
      ...params,
      ...{
        //Always Test for SeriesBase since hoveredSeries only returns when the cursor hovers over a primitive
        "hoveredSeriesBase": advSeriesHitTest(params),
        "hoveredPrimitiveBase": isPrimitive(params.hoveredObjectId) ? params.hoveredObjectId : void 0
      }
    };
  }
  //** Takes a normal MouseEvent and Returns the and extended Lightweight-Charts Mouse Event. */
  _makeEventParams(e) {
    let index = this._chart.timeScale().coordinateToLogical(e.offsetX);
    let sourceEvent = {
      clientX: e.clientX,
      clientY: e.clientY,
      pageX: e.pageX,
      pageY: e.pageY,
      screenX: e.screenX,
      screenY: e.screenY,
      localX: e.offsetX,
      localY: e.offsetY,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey
    };
    const rect = this.chart_el.getBoundingClientRect();
    let pt = rect && e.clientX - rect.left < rect.width && e.clientY - rect.top < rect.height ? {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    } : null;
    return this._convertMouseEventParams(this._getMouseEventParams(index, pt, sourceEvent));
  }
  _fireMouseEvent(e) {
    const delegate = this.eventDelegates.get(e.type);
    if (delegate && delegate.hasListeners()) delegate.fire(this._makeEventParams(e));
  }
  _fireCrosshairEvent(e) {
    const delegate = this.eventDelegates.get("crosshair");
    if (delegate && delegate.hasListeners()) delegate.fire(this._convertMouseEventParams(e));
  }
  subscribeMouseEvent(event, handler) {
    const evtDelegate = this.eventDelegates.get(event);
    if (evtDelegate) {
      evtDelegate.subscribe(handler);
      return;
    }
    const newEvtDelegate = new Delegate();
    this.eventDelegates.set(event, newEvtDelegate);
    newEvtDelegate.subscribe(handler, this);
    if (event === "crosshair") {
      this._chart.subscribeCrosshairMove(this._fireCrosshairEvent.bind(this));
    } else {
      this.chart_el.addEventListener(event, this._fireMouseEvent.bind(this));
    }
  }
  unsubscribeMouseEvent(event, handler) {
    const evtDelegate = this.eventDelegates.get(event);
    if (evtDelegate) evtDelegate.unsubscribe(handler);
  }
  subscribeLogicalRangeChange(handler) {
    this._chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
  }
  unsubscribeLogicalRangeChange(handler) {
    this._chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
  }
  subscribeTimeRangeChange(handler) {
    this._chart.timeScale().subscribeVisibleTimeRangeChange(handler);
  }
  unsubscribeTimeRangeChange(handler) {
    this._chart.timeScale().unsubscribeVisibleTimeRangeChange(handler);
  }
  _onContextMenu(e) {
    const params = this._makeEventParams(e);
    const pane = this.panes()[params.paneIndex ?? -1];
    const menuItems = this.ctxMenuStruct;
    if (pane) menuItems.concat(pane.ctxMenuStruct);
    if (params.hoveredSeriesBase?.ctxMenuStruct) menuItems.concat(params.hoveredSeriesBase?.ctxMenuStruct);
    if (params.hoveredPrimitiveBase?.ctxMenuStruct) menuItems.concat(params.hoveredPrimitiveBase?.ctxMenuStruct);
    MenuContextListener.bind(menuItems)(e);
  }
  // Forward Click Events to Objects after a hit has been detected so each 
  // object doesn't need to perform a ( this === hoveredObj ) check
  _onClickTypeEvents(event, e) {
    e.hoveredPrimitiveBase?.fireClickEvent(event, e);
    e.hoveredSeriesBase?.fireClickEvent(event, e);
  }
  // Extended Frame CLick Event to Manage Activation States of sub-objects
  _onMouseDownEvent(e) {
    let clicked_pane = this.panes().find(p => p.paneIndex == e.paneIndex);
    let change_pane = this._activePane !== clicked_pane;
    let change_series = this._activeSeries !== e.hoveredSeriesBase;
    let change_primitive = this._activePrimitive !== e.hoveredPrimitiveBase;
    if (change_primitive) this._activePrimitive?.onDeactivation();
    if (change_series) this._activeSeries?.onDeactivation();
    if (change_pane) this._activePane?.onDeactivation();
    if (change_pane) {
      this._activePane = clicked_pane;
      this._activePane?.onActivation();
    }
    if (change_series) {
      this._activeSeries = e.hoveredSeriesBase;
      this._activeSeries?.onActivation();
    }
    if (change_primitive) {
      this._activePrimitive = e.hoveredPrimitiveBase;
      this._activePrimitive?.onActivation();
    }
    this._onClickTypeEvents("mousedown", e);
  }
  // #endregion
  // #region -------------- Pane Control Functions ------------------ //
  getPaneByIndex(index) {
    return this.panes().find(p => p.paneIndex === index);
  }
  _updatePaneEls() {
    this.panes().forEach(pane => pane._updatePaneEl());
    this.setPanes(this.panes().sort((a, b) => a.paneIndex - b.paneIndex));
  }
  addPane() {
    const _paneApi = this._chart.addPane(true);
    const _paneWrap = new charting_pane(this, _paneApi);
    this.pane_map.set(_paneApi, _paneWrap);
    requestAnimationFrame(() => {
      this.setPanes(
      // Ensure Panes are ordered before setting them
      [...this.panes(), _paneWrap].sort((p1, p2) => p1.paneIndex - p2.paneIndex));
      this.panes().forEach(p => p._updatePaneEl());
    });
    return _paneWrap;
  }
  restorePanes() {
    this.panes().forEach(pane => pane._restorePane());
    this.applyChartOpts({
      layout: {
        panes: {
          enableResize: true
        }
      }
    });
  }
  maximizePane(pane) {
    if (this.panes().some(p => p.maximized() || p.minimized())) this.restorePanes();else this.panes().forEach(p => p._recordStretchFactor());
    this.panes().forEach(p => {
      p == pane ? p._maximizePane() : p._hidePane();
    });
    this.applyChartOpts({
      layout: {
        panes: {
          enableResize: false
        }
      }
    });
  }
  // #endregion
  // #region -------------- Python API Functions ------------------ //
  //Functions marked as protected are done so it indicate the original intent
  //only encompassed being called from python, not from within JS. uses snake_case for this reason.
  set_whitespace_data(data, primitive_data) {
    this.whitespace_series.setData(data);
    this.setPrimitiveData(primitive_data ?? {
      time: "1970-01-01",
      value: 0
    });
    this.updateTimescalePoints();
  }
  update_whitespace_data(data, primitive_data) {
    this.whitespace_series.update(data);
    this.setPrimitiveData(primitive_data ?? {
      time: "1970-01-01",
      value: 0
    });
    this.updateTimescalePoints();
  }
  set_ticker(new_ticker) {
    this.ticker = new_ticker;
    this.updateTab(this.ticker.symbol);
    if (this == window.activeFrame) window.topbar.setTicker(this.ticker.symbol);
  }
  set_timeframe(new_tf_str) {
    this.timeframe = tf.fromStr(new_tf_str);
    if (this == window.activeFrame) window.topbar.setTimeframe(this.timeframe);
    let newOpts = {
      timeVisible: false,
      secondsVisible: false
    };
    if (this.timeframe.period === "s") {
      newOpts.timeVisible = true;
      newOpts.secondsVisible = true;
    } else if (this.timeframe.period === "m" || this.timeframe.period === "h") {
      newOpts.timeVisible = true;
    }
    this.updateTimescaleOpts(newOpts);
  }
  set_series_type(new_type) {
    this.series_type = new_type;
    if (this == window.activeFrame) window.topbar.setSeries(this.series_type);
  }
  create_indicator(_id, type, name, outputs) {
    let new_indicator = new indicator(_id, type, name, outputs, this);
    this.attached.set(_id, new_indicator);
  }
  delete_indicator(_id) {
    let indicator2 = this.attached.get(_id);
    if (indicator2 === void 0 || !isIndicator(indicator2)) return;
    indicator2.delete();
    this.attached.delete(_id);
  }
  // #endregion
  // #region -------------- Orderable Set Functions ------------------ // 
  indicatorsOnPane(paneAPI) {
    let pane = this.pane_map.get(paneAPI);
    if (pane === void 0) return [];
    return pane.indicators();
  }
  reorderPanes(from, to) {
    if (from < 0 || from > this.paneAPIs.length || from === to) return;
    to = Math.max(Math.min(to, this.paneAPIs.length - 1), 0);
    this.panes()[from]._pane.moveTo(to);
    this._updatePaneEls();
  }
  // #endregion
}
function generateContextMenuStruct(frame2) {
  return [[{
    icon: void 0,
    title: "Restore Pane Heights",
    execute: () => frame2.restorePanes(),
    disable: () => frame2.panes().length < 2
  }]];
}
function DEFAULT_CHART_OPTS() {
  const style = getComputedStyle(document.documentElement);
  const OPTS = {
    layout: {
      // ---- Layout Options ----
      background: {
        type: zi.VerticalGradient,
        topColor: style.getPropertyValue("--chart-bg-color-top"),
        bottomColor: style.getPropertyValue("--chart-bg-color-bottom")
      },
      panes: {
        enableResize: true,
        separatorColor: style.getPropertyValue("--separator-color"),
        separatorHoverColor: applyOpacity(style.getPropertyValue("--accent-color"), 0.2)
      },
      textColor: style.getPropertyValue("--chart-text-color"),
      attributionLogo: style.getPropertyValue("--chart-tv-logo") === "true"
    },
    grid: {
      vertLines: {
        color: style.getPropertyValue("--chart-grid")
      },
      horzLines: {
        color: style.getPropertyValue("--chart-grid")
      }
    },
    leftPriceScale: {
      // ---- VisiblePriceScaleOptions ---- 
      mode: parseInt(style.getPropertyValue("--chart-scale-mode-left")) ?? 1
    },
    rightPriceScale: {
      // ---- VisiblePriceScaleOptions ---- 
      mode: parseInt(style.getPropertyValue("--chart-scale-mode-right")) ?? 1
    },
    crosshair: {
      // ---- Crosshair Options ---- 
      mode: parseInt(style.getPropertyValue("--chart-xhair-mode")) ?? 0
    },
    kineticScroll: {
      // ---- Kinetic Scroll ---- 
      touch: true
    },
    timeScale: {
      shiftVisibleRangeOnNewBar: true,
      allowShiftVisibleRangeOnWhitespaceReplacement: true,
      rightBarStaysOnScroll: true,
      rightOffset: parseInt(style.getPropertyValue("--chart-right-offset")) ?? 20
    },
    addDefaultPane: false
    // Always set to False so 'charting_frame.addPane' always controls pane creation.
  };
  return OPTS;
}
const MouseEventKeyMap = {
  Pw: "time",
  Re: "logical",
  kw: "point",
  yw: "paneIndex",
  Tw: "hoveredSeries",
  Rw: "seriesData",
  Dw: "hoveredObjectId",
  Vw: "sourceEvent"
};
function advSeriesHitTest(params) {
  const orderedPairs = Array.from(params.seriesData).filter(o => o[0].seriesBase?.paneIndex == params.paneIndex).sort((o1, o2) => o2[0].seriesBase?.index - o1[0].seriesBase?.index);
  for (const [Series, SeriesData] of orderedPairs) {
    if (Series.seriesBase?.hitTest(params, SeriesData.se ?? SeriesData.Wt)) return Series.seriesBase;
  }
}

const FrameTypes = {
  2: charting_frame
};
class container {
  id;
  layout;
  frames = [];
  display = [];
  flexFrames = [];
  divRect;
  setStyle;
  setDisplay;
  updateTab;
  constructor(id, updateFunc) {
    this.id = id;
    this.updateTab = updateFunc;
    this.divRect = ContainerCTX().getSize;
    this.setStyle = ContainerCTX().setStyle;
    this.setDisplay = ContainerCTX().setDisplay;
  }
  onShow() {
    this.setDisplay(this.display);
    if (this.layout !== void 0) window.topbar.setLayout(this.layout);
    for (let i = 0; i < num_frames(this.layout); i++) this.frames[i].onShow();
  }
  onHide() {
    for (let i = 0; i < num_frames(this.layout); i++) this.frames[i].onHide();
    abortToolCreation();
  }
  remove() {}
  /**
   * Resize all the child Elements based on the size of the container's Div. 
   */
  refreshSize(container_rect) {
    resize_sections(container_rect ? () => container_rect : this.divRect, this.flexFrames);
    let style = "";
    this.flexFrames.forEach((frame2, i) => {
      style += `
            div.frame:nth-child(${i + 2})${frame2.style}`;
    });
    this.setStyle(style);
    this.refreshFrameSizes();
  }
  refreshFrameSizes() {
    requestAnimationFrame(() => {
      for (let i = 0; i < num_frames(this.layout); i++) this.frames[i].refreshSize();
    });
  }
  /**
   * Called by Python when creating a Frame. Returns the new Frame so it can be made a global var.
   * TODO: Make this instantiate an Abstract Frame that can be transmuted into a Chart_Frame
   * Will Require a UI Element for display and Frame type Selection. Alternatively, set up a
   * add_[type]_frame method for each type of frame and don't allow frame type manipulation.
   */
  add_frame(new_id, type) {
    if (type == 1) console.error("Cannot Create an instance of an Abstract Frame");
    let new_frame = new FrameTypes[type](new_id, this.updateTab);
    this.frames.push(new_frame);
    return new_frame;
  }
  /**
   * Delete a frame from this container. This function assumes that python has already checked that
   * the current layout needs fewer frames than the current number of frames that exist. It also
   * assumes that python will remove the global reference to this frame so it can be garbage collected.
   */
  remove_frame(frame_id) {
    let frame_index = this.frames.findIndex(f => f.id === frame_id);
    if (frame_index === -1) return;
    this.reorderFrames(frame_index, this.frames.length - 1);
    this.frames[this.frames.length - 1] = void 0;
    this.frames.length = this.frames.length - 1;
    this.setDisplay([]);
    this.setDisplay(this.display);
  }
  /** 
   * Create and configure all the necessary frames & separators for a given layout.
   * protected => should only be called from python
   */
  set_layout(layout) {
    this.flexFrames = layout_switch(layout, this.divRect, this.refreshSize.bind(this));
    let layout_displays = [];
    let frame_ind = 0;
    this.flexFrames.forEach(flex_frame => {
      if (flex_frame.orientation === Orientation.null) {
        if (frame_ind < this.frames.length) {
          let frame2 = this.frames[frame_ind];
          flex_frame.mouseDown = frame2.assignActiveFrame.bind(frame2);
          layout_displays.push({
            orientation: flex_frame.orientation,
            mouseDown: flex_frame.mouseDown,
            element: frame2.element,
            el_active: frame2.active,
            el_target: frame2.target
          });
        } else throw new Error("Not Enough Frames to change to the desired layout");
        frame_ind += 1;
      } else {
        layout_displays.push({
          orientation: flex_frame.orientation,
          mouseDown: flex_frame.mouseDown,
          element: void 0,
          el_active: () => false,
          el_target: () => false
        });
      }
    });
    this.layout = layout;
    this.setDisplay(layout_displays);
    this.display = layout_displays;
    this.refreshSize();
    window.topbar.setLayout(layout);
  }
  reorderFrames(from, to) {
    this.frames.splice(to, 0, ...this.frames.splice(from, 1));
    for (let i = Math.min(from, to); i * 2 < this.display.length; i++) {
      let frame2 = this.frames[i];
      this.display[i * 2] = {
        orientation: Orientation.null,
        mouseDown: frame2.assignActiveFrame.bind(frame2),
        element: frame2.element,
        el_active: frame2.active,
        el_target: frame2.target
      };
    }
    this.setDisplay([]);
    this.setDisplay(this.display);
    this.refreshFrameSizes();
  }
}

const Draggabilly = (vitePluginRequire_1756058754781_69492986);
const defaultTabProperties = {
  title: "",
  favicon: null
};
let container_manager$1 = class container_manager {
  containers = /* @__PURE__ */new Map();
  tab_els = /* @__PURE__ */new Map();
  constructor(tabs_el) {
    this.tab_manager.init(tabs_el);
  }
  /**
   * Generate a new container and makes it the window's active container 
   * Protected to indicate it should only be called from Python
   */
  add_container(id) {
    const new_tab_el = this.tab_manager.addTab(id);
    const tmp_ref = new container(id, this.tab_manager.updateTab.bind(void 0, new_tab_el));
    this.tab_els.set(id, new_tab_el);
    this.containers.set(id, tmp_ref);
    this.set_active_container(id);
    return tmp_ref;
  }
  /**
   * Removes a Container, and all its children, from the entire interface.
   * Protected method that should only be called from Python
   */
  remove_container(id) {
    const tab_el = this.tab_els.get(id);
    const container_obj = this.containers.get(id);
    if (container_obj) {
      container_obj.remove();
    }
    if (tab_el) this.tab_manager.removeTab(tab_el);
    this.tab_els.delete(id);
    this.containers.delete(id);
  }
  /**
   * Changes which container is displayed by the app.
   */
  set_active_container(id) {
    const container_obj = this.containers.get(id);
    if (container_obj === void 0 || container_obj === window.activeContainer) return;
    const tab_el = this.tab_els.get(id);
    if (tab_el) this.tab_manager.setCurrentTab(tab_el);
    if (window.activeContainer) {
      window.activeContainer.onHide();
    }
    window.activeContainer = container_obj;
    container_obj.onShow();
    container_obj.refreshSize();
  }
  /**
   * Private Inner Class to separate the responsibility of animating, sizing, and updating
   * Each tab Object. This is an immediately invoked class that requires initialization before use.
   */
  tab_manager = new class {
    el;
    styleEl;
    isDragging;
    //@ts-ignore
    draggabillies;
    //@ts-ignore
    draggabillyDragging = null;
    constructor() {
      this.draggabillies = [];
      this.isDragging = false;
      this.el = document.createElement("div");
      this.styleEl = document.createElement("style");
    }
    init(tabs_el) {
      this.el = tabs_el;
      this.el.style.setProperty("--tab-content-margin", `${TAB_CONTENT_MARGIN}px`);
      this.el.appendChild(this.styleEl);
      window.addEventListener("resize", () => {
        this.cleanUpPreviouslyDraggedTabs();
        this.layoutTabs();
      });
      this.el.addEventListener("dblclick", event => {
        if (event.target === this.el || event.target === this.tabContentEl) window.api.add_container();
      });
      this.layoutTabs();
      this.setupDraggabilly();
    }
    get activeTabEl() {
      return this.el.querySelector(".tab[active]");
    }
    get tabContentEl() {
      return this.el.querySelector(".tabs-content");
    }
    get tabEls() {
      return Array.prototype.slice.call(this.el.querySelectorAll(".tab"));
    }
    get tabContentWidths() {
      const numberOfTabs = this.tabEls.length;
      const tabsContentWidth = this.tabContentEl.clientWidth;
      const tabsCumulativeOverlappedWidth = (numberOfTabs - 1) * TAB_CONTENT_OVERLAP_DISTANCE;
      const targetWidth = (tabsContentWidth - 2 * TAB_CONTENT_MARGIN + tabsCumulativeOverlappedWidth) / numberOfTabs;
      const clampedTargetWidth = Math.floor(Math.max(TAB_CONTENT_MIN_WIDTH, Math.min(TAB_CONTENT_MAX_WIDTH, targetWidth)));
      const totalTabsWidthUsingTarget = clampedTargetWidth * numberOfTabs + 2 * TAB_CONTENT_MARGIN - tabsCumulativeOverlappedWidth;
      const totalExtraWidthDueToFlooring = tabsContentWidth - totalTabsWidthUsingTarget;
      const widths = [];
      let extraWidthRemaining = totalExtraWidthDueToFlooring;
      for (let i = 0; i < numberOfTabs; i += 1) {
        const extraWidth = clampedTargetWidth < TAB_CONTENT_MAX_WIDTH && extraWidthRemaining > 0 ? 1 : 0;
        widths.push(clampedTargetWidth + extraWidth);
        if (extraWidthRemaining > 0) extraWidthRemaining -= 1;
      }
      return widths;
    }
    get tabContentPositions() {
      const positions = [];
      const tabContentWidths = this.tabContentWidths;
      let position = TAB_CONTENT_MARGIN;
      tabContentWidths.forEach((width, i) => {
        const offset = i * TAB_CONTENT_OVERLAP_DISTANCE;
        positions.push(position - offset);
        position += width;
      });
      return positions;
    }
    get tabPositions() {
      const positions = [];
      this.tabContentPositions.forEach(contentPosition => {
        positions.push(contentPosition - TAB_CONTENT_MARGIN);
      });
      return positions;
    }
    layoutTabs() {
      const tabContentWidths = this.tabContentWidths;
      this.tabEls.forEach((tabEl, i) => {
        const contentWidth = tabContentWidths[i];
        const width = contentWidth + 2 * TAB_CONTENT_MARGIN;
        tabEl.style.width = width + "px";
        tabEl.removeAttribute("is-mini");
        tabEl.removeAttribute("is-small");
        tabEl.removeAttribute("is-smaller");
        if (contentWidth < TAB_SIZE_MINI) tabEl.setAttribute("is-mini", "");
        if (contentWidth < TAB_SIZE_SMALL) tabEl.setAttribute("is-small", "");
        if (contentWidth < TAB_SIZE_SMALLER) tabEl.setAttribute("is-smaller", "");
      });
      let styleHTML = "";
      this.tabPositions.forEach((position, i) => {
        styleHTML += `.tabs .tab:nth-child(${i + 1}) {transform: translate3d(${position}px, 0, 0)} `;
      });
      this.styleEl.innerHTML = styleHTML;
    }
    createNewTabEl() {
      const div = document.createElement("div");
      div.innerHTML = tabTemplate;
      return div.firstElementChild;
    }
    addTab(container_id, {
      animate = true,
      background = false
    } = {}) {
      const tabEl = this.createNewTabEl();
      tabEl.setAttribute("data-id", container_id);
      if (animate) {
        tabEl.classList.add("tab-was-just-added");
        setTimeout(() => tabEl.classList.remove("tab-was-just-added"), 500);
      }
      this.tabContentEl.appendChild(tabEl);
      this.updateTab(tabEl, defaultTabProperties.title, defaultTabProperties.price, defaultTabProperties.favicon);
      if (!background) this.setCurrentTab(tabEl);
      this.cleanUpPreviouslyDraggedTabs();
      this.layoutTabs();
      this.setupDraggabilly();
      let close_div = tabEl.querySelector(".tab-close");
      close_div.addEventListener("click", () => {
        window.api.remove_container(container_id);
      });
      return tabEl;
    }
    hasActiveTab() {
      return !!this.activeTabEl;
    }
    setCurrentTab(tabEl) {
      const activeTabEl = this.activeTabEl;
      if (activeTabEl === tabEl) return;
      if (activeTabEl) activeTabEl.removeAttribute("active");
      tabEl.setAttribute("active", "");
    }
    removeTab(tabEl) {
      if (tabEl === this.activeTabEl) {
        if (tabEl.nextElementSibling) {
          window.container_manager.set_active_container(tabEl.nextElementSibling.getAttribute("data-id"));
        } else if (tabEl.previousElementSibling) {
          window.container_manager.set_active_container(tabEl.previousElementSibling.getAttribute("data-id"));
        }
      }
      tabEl.remove();
      this.cleanUpPreviouslyDraggedTabs();
      this.layoutTabs();
      this.setupDraggabilly();
    }
    updateTab(tabEl, title, price, favicon) {
      const tab_title = tabEl.querySelector(".tab-title");
      const tab_price = tabEl.querySelector(".tab-price");
      tab_title.textContent = title ?? "";
      if (price) {
        tab_price.textContent = price;
        tab_price.removeAttribute("empty");
      } else {
        tab_price.setAttribute("empty", "");
      }
      const faviconEl = tabEl.querySelector(".tab-favicon");
      if (favicon) {
        faviconEl.style.backgroundImage = `url('${favicon}')`;
        faviconEl.removeAttribute("hidden");
      } else {
        faviconEl.setAttribute("hidden", "");
        faviconEl.removeAttribute("style");
      }
    }
    cleanUpPreviouslyDraggedTabs() {
      this.tabEls.forEach(tabEl => tabEl.classList.remove("tab-was-just-dragged"));
    }
    setupDraggabilly() {
      const tabEls = this.tabEls;
      const tabPositions = this.tabPositions;
      if (this.isDragging) {
        this.isDragging = false;
        this.el.classList.remove("tabs-is-sorting");
        this.draggabillyDragging.element.classList.remove("tab-is-dragging");
        this.draggabillyDragging.element.style.transform = "";
        this.draggabillyDragging.dragEnd();
        this.draggabillyDragging.isDragging = false;
        this.draggabillyDragging.positionDrag = () => {};
        this.draggabillyDragging.destroy();
        this.draggabillyDragging = null;
      }
      this.draggabillies.forEach(d => d.destroy());
      tabEls.forEach((tabEl, originalIndex) => {
        const originalTabPositionX = tabPositions[originalIndex];
        const draggabilly = new Draggabilly(tabEl, {
          axis: "x",
          handle: ".tab-drag-handle",
          containment: this.tabContentEl
        });
        this.draggabillies.push(draggabilly);
        draggabilly.on("pointerDown", () => {
          window.container_manager.set_active_container(tabEl.getAttribute("data-id"));
        });
        draggabilly.on("dragStart", () => {
          this.isDragging = true;
          this.draggabillyDragging = draggabilly;
          tabEl.classList.add("tab-is-dragging");
          this.el.classList.add("tabs-is-sorting");
        });
        draggabilly.on("dragEnd", () => {
          this.isDragging = false;
          const finalTranslateX = parseFloat(tabEl.style.left);
          tabEl.style.transform = `translate3d(0, 0, 0)`;
          requestAnimationFrame(() => {
            tabEl.style.left = "0";
            tabEl.style.transform = `translate3d(${finalTranslateX}px, 0, 0)`;
            requestAnimationFrame(() => {
              tabEl.classList.remove("tab-is-dragging");
              this.el.classList.remove("tabs-is-sorting");
              tabEl.classList.add("tab-was-just-dragged");
              requestAnimationFrame(() => {
                tabEl.style.transform = "";
                this.layoutTabs();
                this.setupDraggabilly();
              });
            });
          });
        });
        draggabilly.on("dragMove", (event, pointer, moveVector) => {
          const tabEls2 = this.tabEls;
          const currentIndex = tabEls2.indexOf(tabEl);
          const currentTabPositionX = originalTabPositionX + moveVector.x;
          const destinationIndexTarget = closest(currentTabPositionX, tabPositions);
          const destinationIndex = Math.max(0, Math.min(tabEls2.length, destinationIndexTarget));
          if (currentIndex !== destinationIndex) {
            this.animateTabMove(tabEl, currentIndex, destinationIndex);
          }
        });
      });
    }
    animateTabMove(tabEl, originIndex, destinationIndex) {
      if (destinationIndex < originIndex) {
        if (tabEl.parentNode) tabEl.parentNode.insertBefore(tabEl, this.tabEls[destinationIndex]);
      } else {
        if (tabEl.parentNode) tabEl.parentNode.insertBefore(tabEl, this.tabEls[destinationIndex + 1]);
      }
      window.api.reorder_containers(originIndex, destinationIndex);
      this.layoutTabs();
    }
  }();
};
const TAB_SIZE_MINI = 28;
const TAB_SIZE_SMALL = 110;
const TAB_SIZE_SMALLER = 54;
const TAB_CONTENT_MARGIN = 9;
const TAB_CONTENT_OVERLAP_DISTANCE = 1;
const TAB_CONTENT_MIN_WIDTH = 24;
const TAB_CONTENT_MAX_WIDTH = 180;
function closest(value, array) {
  let closest2 = Infinity;
  let closestIndex = -1;
  array.forEach((v, i) => {
    if (Math.abs(value - v) < closest2) {
      closest2 = Math.abs(value - v);
      closestIndex = i;
    }
  });
  return closestIndex;
}
const tabTemplate = `
    <div class="tab">
        <div class="tab-dividers"></div>
        <div class="tab-background">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <symbol id="tab-geometry-left" viewBox="0 0 214 36"><path d="M17 0h197v36H0v-2c4.5 0 9-3.5 9-8V8c0-4.5 3.5-8 8-8z"/></symbol>
                    <symbol id="tab-geometry-right" viewBox="0 0 214 36"><use xlink:href="#tab-geometry-left"/></symbol>
                    <clipPath id="crop"><rect class="mask" width="100%" height="100%" x="0"/></clipPath>
                </defs>
                <svg width="52%" height="100%"><use xlink:href="#tab-geometry-left" width="214" height="36" class="tab-geometry"/></svg>
                <g transform="scale(-1, 1)"><svg width="52%" height="100%" x="-100%" y="0"><use xlink:href="#tab-geometry-right" width="214" height="36" class="tab-geometry"/></svg></g>
            </svg>
        </div>
        <div class="tab-content">
            <div class="tab-favicon"></div>
            <div class="tab-title"></div>
            <div class="tab-price"></div>
            <div class="tab-drag-handle"></div>
            <div class="tab-close"></div>
        </div>
    </div>
`;

var _tmpl$$c = /* @__PURE__ */template(`<div class=titlebar_separator>`),
  _tmpl$2$7 = /* @__PURE__ */template(`<div class="layout_title layout_flex"><div class="titlebar titlebar_grab tabs frameless-drag-region"><div class=tabs-content></div></div><div class="titlebar titlebar_btns frameless-drag-region"><div class=titlebar_separator>`);
function TitleBar(props) {
  let tab_div;
  const [frameless, setFrameless] = createSignal(false);
  const [fullscreen, setFullscreen] = createSignal(false);
  window.api.setFrameless = setFrameless;
  onMount(() => {
    if (tab_div) window.container_manager = new container_manager$1(tab_div);
  });
  return (() => {
    var _el$ = _tmpl$2$7(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.nextSibling,
      _el$4 = _el$3.firstChild;
    var _ref$ = tab_div;
    typeof _ref$ === "function" ? use(_ref$, _el$2) : tab_div = _el$2;
    insert(_el$3, createComponent(Icon, {
      get icon() {
        return icons.window_add;
      },
      classList: {
        window_btn: true
      },
      style: {
        padding: "1px 3px"
      },
      onClick: () => {
        window.api.add_container();
      }
    }), _el$4);
    insert(_el$3, createComponent(ToggleBtn, {
      get icon() {
        return icons.panel_left;
      },
      classList: {
        layout_btn: true
      },
      active: true,
      onAct: () => {
        props.show_section(LAYOUT_SECTIONS.TOOL_BAR);
      },
      onDeact: () => {
        props.hide_section(LAYOUT_SECTIONS.TOOL_BAR);
      }
    }), null);
    insert(_el$3, createComponent(ToggleBtn, {
      get icon() {
        return icons.panel_right;
      },
      classList: {
        layout_btn: true
      },
      onAct: () => {
        props.show_section(LAYOUT_SECTIONS.WIDGET_BAR);
      },
      onDeact: () => {
        props.hide_section(LAYOUT_SECTIONS.WIDGET_BAR);
      }
    }), null);
    insert(_el$3, createComponent(ToggleBtn, {
      get icon() {
        return icons.panel_top;
      },
      classList: {
        layout_btn: true
      },
      active: true,
      onAct: () => {
        props.show_section(LAYOUT_SECTIONS.TOP_BAR);
      },
      onDeact: () => {
        props.hide_section(LAYOUT_SECTIONS.TOP_BAR);
      }
    }), null);
    insert(_el$3, createComponent(ToggleBtn, {
      get icon() {
        return icons.panel_bottom;
      },
      classList: {
        layout_btn: true
      },
      onAct: () => {
        props.show_section(LAYOUT_SECTIONS.UTIL_BAR);
      },
      onDeact: () => {
        props.hide_section(LAYOUT_SECTIONS.UTIL_BAR);
      }
    }), null);
    insert(_el$3, createComponent(Show, {
      get when() {
        return frameless();
      },
      get children() {
        return [_tmpl$$c(), createComponent(Icon, {
          get icon() {
            return icons.minimize;
          },
          classList: {
            window_btn: true
          },
          style: {
            padding: "3px"
          },
          width: 16,
          height: 16,
          onClick: () => {
            window.api.minimize();
          }
        }), createComponent(Show, {
          get when() {
            return fullscreen();
          },
          get children() {
            return [createComponent(Icon, {
              get icon() {
                return icons.restore;
              },
              classList: {
                window_btn: true
              },
              onClick: () => {
                setFullscreen(false);
                window.api.restore();
              }
            }), " "];
          }
        }), createComponent(Show, {
          get when() {
            return !fullscreen();
          },
          get children() {
            return [" ", createComponent(Icon, {
              get icon() {
                return icons.maximize;
              },
              classList: {
                window_btn: true
              },
              style: {
                padding: "2px"
              },
              onClick: () => {
                setFullscreen(true);
                window.api.maximize();
              }
            }), " "];
          }
        }), createComponent(Icon, {
          get icon() {
            return icons.close;
          },
          classList: {
            window_btn: true
          },
          style: {
            padding: "3px"
          },
          width: 16,
          height: 16,
          onClick: () => {
            window.api.close();
          }
        })];
      }
    }), null);
    createRenderEffect(_$p => style(_el$, props.style, _$p));
    return _el$;
  })();
}
const default_togglebtn = {
  icon: "",
  active: false,
  onAct: () => {
    console.log("Button Activated!");
  },
  onDeact: () => {
    console.log("Button Deactivated!");
  }
};
function ToggleBtn(props) {
  const merged = mergeProps(default_togglebtn, props);
  const [activated, setActivated] = createSignal(merged.active);
  const [, iconProps] = splitProps(merged, ["onAct", "onDeact"]);
  iconProps.onClick = () => {
    setActivated(!activated());
    if (activated() && merged.onAct) merged.onAct();else if (!activated() && merged.onDeact) merged.onDeact();
  };
  if (activated() && merged.onAct) merged.onAct();else if (!activated() && merged.onDeact) merged.onDeact();
  return createComponent(Icon, mergeProps(iconProps, {
    get active() {
      return activated();
    }
  }));
}

var _tmpl$$b = /* @__PURE__ */template(`<div>`),
  _tmpl$2$6 = /* @__PURE__ */template(`<div class=menu_section_titlebox><span class="menu_section_text text">`),
  _tmpl$3$2 = /* @__PURE__ */template(`<div class=menu_section>`),
  _tmpl$4$2 = /* @__PURE__ */template(`<span class=menu_text>`),
  _tmpl$5$2 = /* @__PURE__ */template(`<div><span class=menu_selectable>`);
function ShowMenuButton(props) {
  let el = document.createElement("div");
  const [, divProps] = splitProps(props, ["id", "style", "icon_act", "icon_deact"]);
  const display = OverlayCTX().getDisplayAccessor(props.id);
  const setDisplay = OverlayCTX().getDisplaySetter(props.id);
  onMount(() => {
    el.addEventListener("mousedown", e => {
      if (e.button === 0) {
        setDisplay(!display());
        e.stopPropagation();
      }
    });
  });
  if (props.icon_deact) return (() => {
    var _el$ = _tmpl$$b();
    var _ref$ = el;
    typeof _ref$ === "function" ? use(_ref$, _el$) : el = _el$;
    spread(_el$, divProps, false, true);
    insert(_el$, createComponent(Icon, {
      get icon() {
        return display() ? props.icon_act : props.icon_deact;
      }
    }));
    return _el$;
  })();else return (() => {
    var _el$2 = _tmpl$$b();
    var _ref$2 = el;
    typeof _ref$2 === "function" ? use(_ref$2, _el$2) : el = _el$2;
    spread(_el$2, divProps, false, true);
    insert(_el$2, createComponent(Icon, {
      get icon() {
        return props.icon_act;
      },
      get style() {
        return {
          rotate: display() ? "180deg" : "0deg"
        };
      }
    }));
    return _el$2;
  })();
}
function MenuSection(props) {
  const [display, setDisplay] = createSignal(props.showByDefault);
  return [(() => {
    var _el$3 = _tmpl$2$6(),
      _el$4 = _el$3.firstChild;
    _el$3.$$click = () => setDisplay(!display());
    insert(_el$4, () => props.label.toUpperCase());
    insert(_el$3, createComponent(Icon, {
      get icon() {
        return icons.menu_arrow_sn;
      },
      get style() {
        return {
          rotate: display() ? "360deg" : "180deg"
        };
      }
    }), null);
    return _el$3;
  })(), createComponent(Show, {
    get when() {
      return display();
    },
    get children() {
      var _el$5 = _tmpl$3$2();
      insert(_el$5, () => props.children);
      createRenderEffect(_$p => style(_el$5, props.style, _$p));
      return _el$5;
    }
  })];
}
const menuItemPropNames = ["label", "icon", "data", "onSel", "expand", "star", "starAct", "starDeact", "starStyle"];
function MenuItem(props) {
  props.classList = mergeProps(props.classList, {
    menu_item: true
  });
  if (props.expand === void 0) props.expand = false;
  const [menuProps, divProps] = splitProps(props, menuItemPropNames);
  return (() => {
    var _el$6 = _tmpl$5$2(),
      _el$7 = _el$6.firstChild;
    spread(_el$6, divProps, false, true);
    _el$7.$$click = e => {
      if (e.button === 0 && props.onSel) props.onSel();
    };
    insert(_el$7, createComponent(Show, {
      get when() {
        return menuProps.icon;
      },
      get children() {
        return createComponent(Icon, {
          get icon() {
            return menuProps.icon ?? "";
          }
        });
      }
    }), null);
    insert(_el$7, createComponent(Show, {
      get when() {
        return menuProps.label;
      },
      get children() {
        var _el$8 = _tmpl$4$2();
        insert(_el$8, () => menuProps.label);
        return _el$8;
      }
    }), null);
    insert(_el$6, createComponent(Show, {
      get when() {
        return menuProps.star !== void 0;
      },
      get children() {
        return createComponent(MenuItemStar, {
          get selected() {
            return menuProps.star?.();
          },
          get starAct() {
            return menuProps.starAct;
          },
          get starDeact() {
            return menuProps.starDeact;
          },
          get style() {
            return props.starStyle ?? {};
          }
        });
      }
    }), null);
    createRenderEffect(_$p => (_$p = menuProps.expand ? "-webkit-fill-available" : void 0) != null ? _el$7.style.setProperty("width", _$p) : _el$7.style.removeProperty("width"));
    return _el$6;
  })();
}
function MenuItemStar(props) {
  function toggleState() {
    if (!props.selected && props.starAct) props.starAct();else if (props.starDeact) props.starDeact();
  }
  return createComponent(Icon, {
    "class": "menu_item_star",
    onClick: e => {
      if (e.button === 0) toggleState();
    },
    get icon() {
      return props.selected ? icons.star_filled : icons.star;
    },
    get style() {
      return props.style;
    }
  });
}
delegateEvents(["click"]);

var _tmpl$$a = /* @__PURE__ */template(`<div class=toolbar_container>`),
  _tmpl$2$5 = /* @__PURE__ */template(`<div class=menu_section_titlebox>`);
function ToolBarMenuButton(props) {
  let el = document.createElement("div");
  const [location, setLocation] = createSignal({
    x: 0,
    y: 0
  });
  const [displayIcon, setDisplayIcon] = createSignal(props.default_icon);
  const updateLocation = () => {
    setLocation({
      x: el.getBoundingClientRect().right,
      y: el.getBoundingClientRect().top
    });
  };
  OverlayCTX().attachOverlay(props.id, createComponent(ToolBarOverlay, {
    get id() {
      return props.id;
    },
    location,
    updateLocation,
    get tools() {
      return props.tools;
    },
    setIcon: setDisplayIcon
  }));
  return (() => {
    var _el$ = _tmpl$$a();
    var _ref$ = el;
    typeof _ref$ === "function" ? use(_ref$, _el$) : el = _el$;
    insert(_el$, createComponent(Icon, {
      get icon() {
        return displayIcon();
      },
      get active() {
        return activePrimitiveTool()?.icon == displayIcon();
      },
      get selected() {
        return TOOL_MAP.get(displayIcon())?.selected?.();
      },
      onClick: () => selectTool(displayIcon()),
      classList: {
        toolbar_icon_btn: true
      }
    }), null);
    insert(_el$, createComponent(ShowMenuButton, {
      get id() {
        return props.id;
      },
      classList: {
        toolbar_menu_button: true
      },
      get icon_act() {
        return icons.menu_arrow_ew;
      }
    }), null);
    return _el$;
  })();
}
function ToolBarOverlay(props) {
  let setDisplay;
  const favTools = ToolBoxCTX().tools;
  const setFavTools = ToolBoxCTX().setTools;
  const [, overlayDivProps] = splitProps(props, ["tools", "setIcon"]);
  function addFavorite(tool) {
    if (!favTools().includes(tool)) setFavTools([...favTools(), tool]);
  }
  function removeFavorite(tool) {
    if (favTools().includes(tool)) setFavTools(favTools().filter(fav => fav != tool));
  }
  function onSel(tool) {
    selectTool(tool);
    props.setIcon(tool);
    setDisplay(false);
  }
  onMount(() => {
    setDisplay = OverlayCTX().getDisplaySetter(props.id);
  });
  return createComponent(OverlayDiv, mergeProps(overlayDivProps, {
    get location_ref() {
      return location_reference.TOP_LEFT;
    },
    get children() {
      return createComponent(For, {
        get each() {
          return props.tools;
        },
        children: tools_sublist => [_tmpl$2$5(), createComponent(For, {
          each: tools_sublist,
          children: tool => createComponent(Show, {
            get when() {
              return TOOL_MAP.has(tool);
            },
            get children() {
              return createComponent(MenuItem, {
                expand: true,
                icon: tool,
                get label() {
                  return TOOL_MAP.get(tool)?.label ?? "";
                },
                onSel: () => onSel(tool),
                star: () => favTools().includes(tool),
                starAct: () => addFavorite(tool),
                starDeact: () => removeFavorite(tool),
                starStyle: {
                  width: "20px",
                  height: "20px"
                }
              });
            }
          })
        })]
      });
    }
  }));
}

var _tmpl$$9 = /* @__PURE__ */template(`<div class="layout_main layout_flex flex_col"><div class=toolbar><div class=toolbar_separator></div></div><div class=toolbar><div class=toolbar_separator>`),
  _tmpl$2$4 = /* @__PURE__ */template(`<div class=toolbox_btn_wrap>`);
function ToolBar(props) {
  return (() => {
    var _el$ = _tmpl$$9(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$4 = _el$2.nextSibling;
      _el$4.firstChild;
    spread(_el$, props, false, true);
    insert(_el$2, createComponent(ToolBarMenuButton, crosshair_menu_props), _el$3);
    insert(_el$2, createComponent(ToolBarMenuButton, trend_menu_props), _el$3);
    insert(_el$2, createComponent(ToolBarMenuButton, fib_menu_props), _el$3);
    insert(_el$2, createComponent(ToolBarMenuButton, measure_menu_props), _el$3);
    insert(_el$4, createComponent(ToolBoxToggle, {}), null);
    return _el$;
  })();
}
function ToolBoxToggle() {
  const id = "toolbox";
  const visibilitySignal = createSignal(false);
  const visibility = visibilitySignal[0];
  const setVisibility = visibilitySignal[1];
  const location = ToolBoxCTX().location;
  const setLocation = ToolBoxCTX().setLocation;
  OverlayCTX().attachOverlay(id, createComponent(ToolBoxOverlay, {
    id
  }), visibilitySignal, null
  // Don't Auto Hide & don't hide on esc click
  );
  createEffect(on$1(visibility, () => {
    if (visibility() && location().x === -1 && location().y === -1) {
      let refLoc = document.querySelector(".toolbox_btn_wrap")?.getBoundingClientRect();
      if (refLoc === void 0) return;
      setLocation({
        x: refLoc.right + 20,
        y: refLoc.top + 2
      });
    }
  }));
  return (() => {
    var _el$6 = _tmpl$2$4();
    _el$6.$$mousedown = () => setVisibility(!visibility());
    insert(_el$6, createComponent(Icon, {
      get icon() {
        return visibility() ? icons.star_filled : icons.star;
      },
      get selected() {
        return visibility();
      },
      width: 26,
      height: 26,
      classList: {
        toolbox_btn: true
      }
    }));
    return _el$6;
  })();
}
const default_toolbox_props = {
  tools: () => [],
  setTools: () => {},
  location: () => {
    return {
      x: 0,
      y: 0
    };
  },
  setLocation: () => {}
};
let ToolboxContext = createContext(default_toolbox_props);
function ToolBoxCTX() {
  return useContext(ToolboxContext);
}
function ToolBoxContext(props) {
  const [tools, setTools] = createSignal([]);
  const [location, setLocation] = createSignal({
    x: -1,
    y: -1
  });
  const ToolboxCTX = {
    tools,
    setTools,
    location,
    setLocation
  };
  ToolboxContext = createContext(ToolboxCTX);
  return createComponent(ToolboxContext.Provider, {
    value: ToolboxCTX,
    get children() {
      return props.children;
    }
  });
}
function ToolBoxOverlay(props) {
  const tools = ToolBoxCTX().tools;
  const location = ToolBoxCTX().location;
  const setLocation = ToolBoxCTX().setLocation;
  return createComponent(OverlayDiv, {
    get id() {
      return props.id;
    },
    location,
    setLocation,
    get location_ref() {
      return location_reference.TOP_LEFT;
    },
    get drag_handle() {
      return `#${props.id}>#menu_dragable`;
    },
    get bounding_client_id() {
      return `#${props.id}>#menu_dragable`;
    },
    get children() {
      return [createComponent(Icon, {
        hover: false,
        get icon() {
          return icons.menu_dragable;
        }
      }), createComponent(For, {
        get each() {
          return tools();
        },
        children: tool => createComponent(Icon, {
          icon: tool,
          onClick: () => selectTool(tool),
          get active() {
            return activePrimitiveTool()?.icon === tool;
          },
          get selected() {
            return TOOL_MAP.get(tool)?.selected?.();
          }
        })
      })];
    }
  });
}
const crosshair_menu_props = {
  id: "crosshair_menu",
  default_icon: icons.cursor_cross,
  tools: [[icons.cursor_cross, icons.cursor_dot, icons.cursor_arrow]]
};
const trend_menu_props = {
  id: "trend_menu",
  default_icon: icons.trend_line,
  tools: [[icons.trend_line, icons.horiz_line, icons.vert_line, icons.horiz_ray], [icons.polyline], [icons.channel_parallel, icons.channel_disjoint]]
};
const fib_menu_props = {
  id: "fibonacci_menu",
  default_icon: icons.fib_retrace,
  tools: [[icons.fib_retrace, icons.fib_extend]]
};
const measure_menu_props = {
  id: "measure_menu",
  default_icon: icons.range_price,
  tools: [[icons.range_price, icons.range_date, icons.range_price_date]]
};
delegateEvents(["mousedown"]);

var _tmpl$$8 = /* @__PURE__ */template(`<div class=topbar_container><div class="menu_selectable indicator_topbar_btn"><div class=text>Indicators`),
  _tmpl$2$3 = /* @__PURE__ */template(`<div class=indicator_title_bar><h1 class=text>Indicators</h1><div id=indicator_menu_drag>`),
  _tmpl$3$1 = /* @__PURE__ */template(`<div class=indicator_title_separator>`),
  _tmpl$4$1 = /* @__PURE__ */template(`<div id=indicator_pkg_description>`),
  _tmpl$5$1 = /* @__PURE__ */template(`<div id=indicator_info_container><div id=indicator_packages_list><table><tbody></tbody></table></div><div class=indicator_vert_separator></div><div id=indicator_details_list><table><tbody>`),
  _tmpl$6$1 = /* @__PURE__ */template(`<div class=version>`),
  _tmpl$7$1 = /* @__PURE__ */template(`<div class=pkg_card><span>`),
  _tmpl$8 = /* @__PURE__ */template(`<div class=description>`),
  _tmpl$9 = /* @__PURE__ */template(`<div class=ind_card><span>`);
function IndicatorsBox() {
  const id = "indicator_menu";
  let box_el = document.createElement("div");
  const displaySignal = createSignal(false);
  const [menuLocation, setMenuLocation] = createSignal({
    x: 0,
    y: 0
  });
  const position_menu = () => {
    setMenuLocation({
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.2
    });
  };
  function onClk(e) {
    displaySignal[1](!displaySignal[0]());
    e.stopPropagation();
  }
  onMount(() => {
    box_el.addEventListener("mousedown", e => onClk(e));
    window.addEventListener("resize", position_menu);
  });
  onCleanup(() => {
    window.removeEventListener("resize", position_menu);
  });
  const [packages, setPackages] = createStore({});
  window.api.populate_indicator_pkgs = setPackages;
  OverlayCTX().attachOverlay(id, createComponent(IndicatorsMenu, {
    id,
    packages,
    get setDisplay() {
      return displaySignal[1];
    },
    location: menuLocation,
    setLocation: setMenuLocation,
    updateLocation: position_menu
  }), displaySignal);
  return (() => {
    var _el$ = _tmpl$$8(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild;
    var _ref$ = box_el;
    typeof _ref$ === "function" ? use(_ref$, _el$2) : box_el = _el$2;
    insert(_el$2, createComponent(Icon, {
      get icon() {
        return icons.indicator;
      }
    }), _el$3);
    _el$3.style.setProperty("padding", "0px 2px");
    return _el$;
  })();
}
function IndicatorsMenu(props) {
  const [, overlayDivProps] = splitProps(props, ["setDisplay", "packages"]);
  const activePkgSig = createSignal(void 0);
  return createComponent(OverlayDiv, mergeProps(overlayDivProps, {
    classList: {
      indicator_menu: true
    },
    get location_ref() {
      return location_reference.CENTER;
    },
    drag_handle: "#indicator_menu_drag",
    get bounding_client_id() {
      return `#${props.id}>.indicator_title_bar`;
    },
    get children() {
      return [(() => {
        var _el$4 = _tmpl$2$3(),
          _el$5 = _el$4.firstChild;
          _el$5.nextSibling;
        insert(_el$4, createComponent(Icon, {
          get icon() {
            return icons.indicator_on_stratagy;
          },
          width: 28,
          height: 28,
          classList: {
            icon: false,
            symbol_search_icon: true
          }
        }), _el$5);
        _el$5.style.setProperty("margin", "8px 10px");
        insert(_el$4, createComponent(Icon, {
          get icon() {
            return icons.close;
          },
          style: {
            "margin-right": "15px",
            padding: "5px"
          },
          onClick: () => props.setDisplay(false)
        }), null);
        return _el$4;
      })(), _tmpl$3$1(), (() => {
        var _el$8 = _tmpl$5$1(),
          _el$9 = _el$8.firstChild,
          _el$0 = _el$9.firstChild,
          _el$1 = _el$0.firstChild,
          _el$10 = _el$9.nextSibling,
          _el$11 = _el$10.nextSibling,
          _el$12 = _el$11.firstChild,
          _el$13 = _el$12.firstChild;
        insert(_el$1, createComponent(For, {
          get each() {
            return Object.values(props.packages);
          },
          children: pkg => createComponent(PackageCard, mergeProps({
            activePkgSig
          }, pkg))
        }));
        insert(_el$13, createComponent(For, {
          get each() {
            return Object.values(activePkgSig[0]()?.indicators ?? {});
          },
          children: details => createComponent(IndicatorCard, mergeProps(details, {
            get activePkgKey() {
              return activePkgSig[0]()?.pkg_key ?? "";
            },
            get setDisplay() {
              return props.setDisplay;
            }
          }))
        }));
        insert(_el$11, createComponent(Show, {
          get when() {
            return activePkgSig[0]()?.description;
          },
          get children() {
            var _el$14 = _tmpl$4$1();
            createRenderEffect(() => _el$14.innerHTML = activePkgSig[0]()?.description);
            return _el$14;
          }
        }), null);
        return _el$8;
      })()];
    }
  }));
}
function PackageCard(props) {
  const [, pkg] = splitProps(props, ["activePkgSig"]);
  return (() => {
    var _el$15 = _tmpl$7$1(),
      _el$16 = _el$15.firstChild;
    _el$15.$$click = () => props.activePkgSig[1](pkg);
    insert(_el$15, createComponent(Show, {
      get when() {
        return props.pkg_version;
      },
      get children() {
        var _el$17 = _tmpl$6$1();
        createRenderEffect(() => _el$17.innerText = props.pkg_version ?? "");
        return _el$17;
      }
    }), null);
    createRenderEffect(_p$ => {
      var _v$ = props.activePkgSig[0]()?.pkg_key == props.pkg_key ? "" : void 0,
        _v$2 = props.pkg_name;
      _v$ !== _p$.e && setAttribute(_el$15, "active", _p$.e = _v$);
      _v$2 !== _p$.t && (_el$16.innerText = _p$.t = _v$2);
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$15;
  })();
}
function IndicatorCard(props) {
  if (props.unlisted) return;
  return (() => {
    var _el$18 = _tmpl$9(),
      _el$19 = _el$18.firstChild;
    _el$18.$$click = () => {
      send_indicator_request(props.activePkgKey, props.ind_key);
      props.setDisplay(false);
    };
    insert(_el$18, createComponent(Show, {
      get when() {
        return props.description && props.description != "";
      },
      get children() {
        var _el$20 = _tmpl$8();
        createRenderEffect(() => _el$20.innerHTML = props.description ?? "");
        return _el$20;
      }
    }), null);
    insert(_el$18, createComponent(Show, {
      get when() {
        return props.ind_version && props.ind_version != "";
      },
      get children() {
        var _el$21 = _tmpl$6$1();
        createRenderEffect(() => _el$21.innerText = props.ind_version ?? "");
        return _el$21;
      }
    }), null);
    createRenderEffect(() => _el$19.innerText = props.ind_name);
    return _el$18;
  })();
}
function send_indicator_request(pkg_key, ind_key) {
  if (window.activeContainer == void 0 || window.activeFrame == void 0) return;
  window.api.indicator_request(window.activeContainer.id, window.activeFrame.id, pkg_key, ind_key);
}
delegateEvents(["click"]);

var _tmpl$$7 = /* @__PURE__ */template(`<div class=topbar_container>`);
const default_layout_opts = {
  menu_listings: {
    simple: [Container_Layouts.SINGLE, Container_Layouts.DOUBLE_HORIZ, Container_Layouts.DOUBLE_VERT],
    triple: [Container_Layouts.TRIPLE_VERT, Container_Layouts.TRIPLE_HORIZ, Container_Layouts.TRIPLE_VERT_LEFT, Container_Layouts.TRIPLE_VERT_RIGHT, Container_Layouts.TRIPLE_HORIZ_TOP, Container_Layouts.TRIPLE_HORIZ_BOTTOM],
    quadruple: [Container_Layouts.QUAD_SQ_V, Container_Layouts.QUAD_SQ_H, Container_Layouts.QUAD_VERT, Container_Layouts.QUAD_HORIZ, Container_Layouts.QUAD_LEFT, Container_Layouts.QUAD_RIGHT, Container_Layouts.QUAD_TOP, Container_Layouts.QUAD_BOTTOM]
  },
  favorites: [Container_Layouts.SINGLE, Container_Layouts.DOUBLE_HORIZ, Container_Layouts.DOUBLE_VERT]
};
function LayoutSwitcher() {
  const id = "layout_selector";
  let el = document.createElement("div");
  const [selectedLayout, setSelectedLayout] = createSignal(Container_Layouts.SINGLE);
  const [menuLocation, setMenuLocation] = createSignal({
    x: 0,
    y: 0
  });
  const [LayoutOpts, setLayoutOpts] = createStore(default_layout_opts);
  const ordered_favorites = () => {
    return Array.from(LayoutOpts.favorites).sort((a, b) => a - b);
  };
  const updateLocation = () => {
    setMenuLocation({
      x: el.getBoundingClientRect().right,
      y: el.getBoundingClientRect().bottom
    });
  };
  window.topbar.setLayout = setSelectedLayout;
  window.api.update_layout_topbar_opts = setLayoutOpts;
  function onSel(layout) {
    window.api.layout_change(window.activeContainer?.id ?? "", layout);
  }
  OverlayCTX().attachOverlay(id, createComponent(LayoutMenu, {
    id,
    onSel,
    opts: LayoutOpts,
    setOpts: setLayoutOpts,
    location: menuLocation,
    updateLocation
  }));
  return (() => {
    var _el$ = _tmpl$$7();
    var _ref$ = el;
    typeof _ref$ === "function" ? use(_ref$, _el$) : el = _el$;
    _el$.style.setProperty("margin-right", "4px");
    insert(_el$, createComponent(Show, {
      get when() {
        return !LayoutOpts.favorites.includes(selectedLayout());
      },
      get children() {
        return createComponent(Icon, {
          get icon() {
            return layout_icon_map[selectedLayout()];
          },
          classList: {
            topbar_icon_btn: true
          },
          active: true
        });
      }
    }), null);
    insert(_el$, createComponent(For, {
      get each() {
        return ordered_favorites();
      },
      children: fav => createComponent(Icon, {
        get icon() {
          return layout_icon_map[fav];
        },
        classList: {
          topbar_icon_btn: true
        },
        get active() {
          return selectedLayout() === fav;
        },
        onClick: () => onSel(fav)
      })
    }), null);
    insert(_el$, createComponent(ShowMenuButton, {
      id,
      "class": "topbar_menu_button",
      get icon_act() {
        return icons.menu_arrow_ns;
      }
    }), null);
    return _el$;
  })();
}
const layout_icon_map = {
  0: icons.layout_single,
  1: icons.layout_double_vert,
  2: icons.layout_double_horiz,
  3: icons.layout_triple_vert,
  4: icons.layout_triple_left,
  5: icons.layout_triple_right,
  6: icons.layout_triple_horiz,
  7: icons.layout_triple_top,
  8: icons.layout_triple_bottom,
  9: icons.layout_quad_sq_v,
  10: icons.layout_quad_sq_h,
  11: icons.layout_quad_vert,
  12: icons.layout_quad_horiz,
  13: icons.layout_quad_left,
  14: icons.layout_quad_right,
  15: icons.layout_quad_top,
  16: icons.layout_quad_bottom
};
const default_display$1 = /* @__PURE__ */new Map([["simple", true], ["triple", false], ["quadruple", false]]);
function LayoutMenu(props) {
  const [, overlayDivProps] = splitProps(props, ["opts", "setOpts"]);
  const accessor = str => props.opts.menu_listings[str];
  function addFavorite(series) {
    if (!props.opts.favorites.includes(series)) props.setOpts("favorites", [...props.opts.favorites, series]);
  }
  function removeFavorite(series) {
    if (props.opts.favorites.includes(series)) props.setOpts("favorites", props.opts.favorites.filter(fav => fav != series));
  }
  return createComponent(OverlayDiv, mergeProps(overlayDivProps, {
    get location_ref() {
      return location_reference.TOP_RIGHT;
    },
    get children() {
      return createComponent(For, {
        get each() {
          return Object.keys(props.opts.menu_listings);
        },
        children: section => createComponent(MenuSection, {
          get label() {
            return section.toLocaleUpperCase();
          },
          get showByDefault() {
            return default_display$1.get(section) ?? false;
          },
          style: {
            display: "flex",
            "flex-direction": "row"
          },
          get children() {
            return createComponent(For, {
              get each() {
                return accessor(section);
              },
              children: type => createComponent(MenuItem, {
                expand: false,
                get icon() {
                  return layout_icon_map[type];
                },
                onSel: () => props.onSel(type),
                star: () => props.opts.favorites.includes(type),
                starAct: () => addFavorite(type),
                starDeact: () => removeFavorite(type)
              })
            });
          }
        })
      });
    }
  }));
}

var _tmpl$$6 = /* @__PURE__ */template(`<div class=topbar_container>`),
  _tmpl$2$2 = /* @__PURE__ */template(`<div class=menu_section_titlebox>`);
const default_series_select_opts = {
  menu_listings: {
    ohlc: [Series_Type.CANDLESTICK, Series_Type.BAR, Series_Type.ROUNDED_CANDLE],
    line: [Series_Type.LINE],
    area: [Series_Type.AREA, Series_Type.BASELINE],
    hist: [Series_Type.HISTOGRAM]
  },
  favorites: [Series_Type.ROUNDED_CANDLE]
};
function SeriesSwitcher() {
  const id = "series_selector";
  let el = document.createElement("div");
  const [selectedSeries, setSelectedSeries] = createSignal();
  const [menuLocation, setMenuLocation] = createSignal({
    x: 0,
    y: 0
  });
  const [SeriesOpts, setSeriesOpts] = createStore(default_series_select_opts);
  const ordered_favorites = () => {
    return Array.from(SeriesOpts.favorites).sort((a, b) => a - b);
  };
  const updateLocation = () => {
    setMenuLocation({
      x: el.getBoundingClientRect().right,
      y: el.getBoundingClientRect().bottom
    });
  };
  window.topbar.setSeries = setSelectedSeries;
  window.api.update_series_topbar_opts = setSeriesOpts;
  function onSel(series) {
    if (window.activeContainer === void 0 || window.activeFrame === void 0) return;
    window.api.series_change(window.activeContainer.id, window.activeFrame.id, series);
  }
  OverlayCTX().attachOverlay(id, createComponent(SeriesMenu, {
    id,
    onSel,
    opts: SeriesOpts,
    setOpts: setSeriesOpts,
    location: menuLocation,
    updateLocation
  }));
  return (() => {
    var _el$ = _tmpl$$6();
    var _ref$ = el;
    typeof _ref$ === "function" ? use(_ref$, _el$) : el = _el$;
    insert(_el$, createComponent(Show, {
      get when() {
        return memo(() => !!selectedSeries())() && !SeriesOpts.favorites.includes(selectedSeries());
      },
      get children() {
        return createComponent(Icon, {
          get icon() {
            return series_icon_map[selectedSeries()];
          },
          classList: {
            topbar_icon_btn: true
          },
          active: true
        });
      }
    }), null);
    insert(_el$, createComponent(For, {
      get each() {
        return ordered_favorites();
      },
      children: fav => createComponent(Icon, {
        get icon() {
          return series_icon_map[fav];
        },
        classList: {
          topbar_icon_btn: true
        },
        get active() {
          return selectedSeries() === fav;
        },
        onClick: () => onSel(fav)
      })
    }), null);
    insert(_el$, createComponent(ShowMenuButton, {
      id,
      "class": "topbar_menu_button",
      get icon_act() {
        return icons.menu_arrow_ns;
      }
    }), null);
    return _el$;
  })();
}
const series_icon_map = {
  0: icons.close,
  //Whitespace Data -> No Icon
  1: icons.close,
  //Single Value Data -> No Icon
  2: icons.series_line,
  3: icons.series_area,
  4: icons.series_baseline,
  5: icons.series_histogram,
  6: icons.close,
  //OHLC Data -> No Icon
  7: icons.candle_bar,
  8: icons.candle_regular,
  // 9: icons.series_step_line,
  9: icons.candle_rounded
};
const series_label_map = {
  0: "Whitespace Data",
  1: "Single Value Data",
  2: "Line",
  3: "Area",
  4: "Baseline",
  5: "Histogram",
  6: "OHLC Data",
  7: "Bar",
  8: "Candlestick",
  // 9: "HLC Area",
  9: "Rounded Candlestick"
};
function SeriesMenu(props) {
  const [, overlayDivProps] = splitProps(props, ["opts", "setOpts"]);
  const accessor = str => props.opts.menu_listings[str];
  function addFavorite(series) {
    if (!props.opts.favorites.includes(series)) props.setOpts("favorites", [...props.opts.favorites, series]);
  }
  function removeFavorite(series) {
    if (props.opts.favorites.includes(series)) props.setOpts("favorites", props.opts.favorites.filter(fav => fav != series));
  }
  return createComponent(OverlayDiv, mergeProps(overlayDivProps, {
    get location_ref() {
      return location_reference.TOP_RIGHT;
    },
    get children() {
      return createComponent(For, {
        get each() {
          return Object.keys(props.opts.menu_listings);
        },
        children: section => [_tmpl$2$2(), createComponent(For, {
          get each() {
            return accessor(section);
          },
          children: type => createComponent(MenuItem, {
            expand: true,
            get icon() {
              return series_icon_map[type];
            },
            get label() {
              return series_label_map[type];
            },
            onSel: () => props.onSel(type),
            star: () => props.opts.favorites.includes(type),
            starAct: () => addFavorite(type),
            starDeact: () => removeFavorite(type)
          })
        })]
      });
    }
  }));
}

var _tmpl$$5 = /* @__PURE__ */template(`<div class=topbar_container><div id=symbol_box class=sel_highlight><div id=search_text class="topbar_containers text"></div></div><div>`),
  _tmpl$2$1 = /* @__PURE__ */template(`<div class=symbol_title_bar><h1 class=text>Symbol Search</h1><div id=symbol_search_drag>`),
  _tmpl$3 = /* @__PURE__ */template(`<div class=symbol_input><input class="search_input text"type=text><input class="search_submit text"type=submit value=Submit>`),
  _tmpl$4 = /* @__PURE__ */template(`<div class=symbol_list><table id=symbols_table><thead><tr class="symbol_list_item text"><th>Symbol</th><th>Name</th><th>Exchange</th><th>Asset Class</th><th>Source</th></tr></thead><tbody>`),
  _tmpl$5 = /* @__PURE__ */template(`<tr class="symbol_list_item text"><td></td><td></td><td></td><td></td><td>`),
  _tmpl$6 = /* @__PURE__ */template(`<div class="symbol_select_filter text"><div id=any class=bubble_item active>Any`),
  _tmpl$7 = /* @__PURE__ */template(`<div class=bubble_item>`);
const default_sel_filters = {
  exchange: ["NYSE", "NASDAQ"],
  source: ["Local", "Alpaca"],
  asset_class: ["Crypto", "Equity"]
};
function SymbolSearchBox() {
  const id = "symbol_search";
  let box_el = document.createElement("div");
  let replace_el = document.createElement("div");
  const displaySignal = createSignal(false);
  const display = displaySignal[0];
  const setDisplay = displaySignal[1];
  const [ticker2, setTicker] = createSignal("FRACTA");
  const [replace, setReplace] = createSignal(true);
  const [menuLocation, setMenuLocation] = createSignal({
    x: 0,
    y: 0
  });
  window.topbar.setTicker = setTicker;
  function onClk(e, replace_symbol) {
    setReplace(replace_symbol);
    setDisplay(!display());
    e.stopPropagation();
  }
  const position_menu = () => {
    setMenuLocation({
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.2
    });
  };
  onMount(() => {
    box_el.addEventListener("mousedown", e => onClk(e, true));
    replace_el.addEventListener("mousedown", e => onClk(e, false));
    window.addEventListener("resize", position_menu);
  });
  onCleanup(() => {
    window.removeEventListener("resize", position_menu);
  });
  const [tickers, setTickers] = createSignal([]);
  const [filters, setFilters] = createStore(default_sel_filters);
  window.api.set_search_filters = setFilters;
  window.api.populate_search_tickers = setTickers;
  OverlayCTX().attachOverlay(id, createComponent(SymbolSearchMenu, {
    id,
    get tickers() {
      return tickers();
    },
    display,
    setDisplay,
    filters,
    setFilters,
    get replace() {
      return replace();
    },
    setReplace,
    location: menuLocation,
    setLocation: setMenuLocation,
    updateLocation: position_menu
  }), displaySignal);
  return (() => {
    var _el$ = _tmpl$$5(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$4 = _el$2.nextSibling;
    var _ref$ = box_el;
    typeof _ref$ === "function" ? use(_ref$, _el$2) : box_el = _el$2;
    insert(_el$2, createComponent(Icon, {
      get icon() {
        return icons.menu_search;
      },
      style: {
        margin: "5px"
      },
      width: 20,
      height: 20
    }), _el$3);
    insert(_el$3, ticker2);
    var _ref$2 = replace_el;
    typeof _ref$2 === "function" ? use(_ref$2, _el$4) : replace_el = _el$4;
    _el$4.style.setProperty("display", "flex");
    _el$4.style.setProperty("align-items", "center");
    insert(_el$4, createComponent(Icon, {
      get icon() {
        return icons.menu_add;
      }
    }));
    return _el$;
  })();
}
const label_map = /* @__PURE__ */new Map([["exchange", "Exchange:"], ["source", "Data Source:"], ["asset_class", "Asset Class:"]]);
function SymbolSearchMenu(props) {
  const [, overlayDivProps] = splitProps(props, ["replace", "setReplace", "tickers", "filters", "setFilters", "setDisplay"]);
  createEffect(() => {
    if (props.display()) {
      setTimeout(() => {
        let el = document.querySelector("input.search_input[type=text]");
        el?.focus();
        el?.select();
      }, 100);
    }
  });
  function fetch(symbol) {
    if (window.activeFrame?.timeframe) window.api.timeseries_request(window.activeContainer?.id, window.activeFrame?.id, symbol, window.activeFrame?.timeframe.toString());
    props.setDisplay(false);
  }
  function search(confirmed) {
    const search_menu = document.querySelector(`#${props.id}`);
    if (!search_menu) return;
    const symbol = search_menu.querySelector("input.search_input").value;
    const exchanges = Array.from(search_menu.querySelectorAll("#exchange > .bubble_item[active]:not([id=any])"), node => node?.textContent ?? "");
    const sources = Array.from(search_menu.querySelectorAll("#source > .bubble_item[active]:not([id=any])"), node => node?.textContent ?? "");
    const asset_classes = Array.from(search_menu.querySelectorAll("#asset_class > .bubble_item[active]:not([id=any])"), node => node?.textContent ?? "");
    window.api.symbol_search(symbol, sources, exchanges, asset_classes, confirmed);
  }
  function update_filter(e) {
    let target = e.target;
    if (target.hasAttribute("active")) {
      target.removeAttribute("active");
      if (target.parentElement?.querySelectorAll(".bubble_item[active]").length === 0) target.parentElement.querySelector("#any")?.setAttribute("active", "");
    } else {
      if (target.parentElement?.querySelectorAll("#any[active]").length === 1) target.parentElement.querySelector("#any")?.removeAttribute("active");
      target.setAttribute("active", "");
    }
    search(false);
  }
  function update_filter_any(e) {
    let target = e.target;
    let bubbles = target.parentElement?.querySelectorAll(".bubble_item[active]");
    for (let i = 0; i < bubbles?.length; i++) bubbles[i].removeAttribute("active");
    target.setAttribute("active", "");
    search(false);
  }
  return createComponent(OverlayDiv, mergeProps(overlayDivProps, {
    classList: {
      symbol_menu: true
    },
    get location_ref() {
      return location_reference.CENTER;
    },
    drag_handle: "#symbol_search_drag",
    get bounding_client_id() {
      return `#${props.id}>.symbol_title_bar`;
    },
    get children() {
      return [(() => {
        var _el$5 = _tmpl$2$1(),
          _el$6 = _el$5.firstChild;
          _el$6.nextSibling;
        insert(_el$5, createComponent(Icon, {
          get icon() {
            return icons.menu_search;
          },
          width: 28,
          height: 28,
          classList: {
            icon: false,
            symbol_search_icon: true
          }
        }), _el$6);
        _el$6.style.setProperty("margin", "8px 10px");
        insert(_el$5, createComponent(Icon, {
          get icon() {
            return icons.close;
          },
          style: {
            "margin-right": "15px",
            padding: "5px"
          },
          onClick: () => props.setDisplay(false)
        }), null);
        return _el$5;
      })(), (() => {
        var _el$8 = _tmpl$3(),
          _el$9 = _el$8.firstChild,
          _el$0 = _el$9.nextSibling;
        _el$9.addEventListener("keypress", e => {
          if (e.key === "Enter") search(true);
        });
        _el$9.$$input = () => search(false);
        _el$0.$$click = () => search(true);
        return _el$8;
      })(), (() => {
        var _el$1 = _tmpl$4(),
          _el$10 = _el$1.firstChild,
          _el$11 = _el$10.firstChild,
          _el$12 = _el$11.nextSibling;
        insert(_el$12, createComponent(For, {
          get each() {
            return props.tickers;
          },
          children: symbol => (() => {
            var _el$13 = _tmpl$5(),
              _el$14 = _el$13.firstChild,
              _el$15 = _el$14.nextSibling,
              _el$16 = _el$15.nextSibling,
              _el$17 = _el$16.nextSibling,
              _el$18 = _el$17.nextSibling;
            _el$13.$$click = () => fetch(symbol);
            insert(_el$14, () => symbol.symbol);
            insert(_el$15, () => symbol.name ?? "-");
            insert(_el$16, () => symbol.exchange ?? "-");
            insert(_el$17, () => symbol.asset_class ?? "-");
            insert(_el$18, () => symbol.source ?? "-");
            return _el$13;
          })()
        }));
        return _el$1;
      })(), createComponent(For, {
        get each() {
          return Object.keys(props.filters);
        },
        children: filter => (() => {
          var _el$19 = _tmpl$6(),
            _el$20 = _el$19.firstChild;
          setAttribute(_el$19, "id", filter);
          insert(_el$19, () => label_map.get(filter), _el$20);
          _el$20.$$mousedown = update_filter_any;
          insert(_el$19, createComponent(For, {
            get each() {
              return props.filters[filter];
            },
            children: opt => (() => {
              var _el$21 = _tmpl$7();
              _el$21.$$mousedown = update_filter;
              insert(_el$21, opt);
              return _el$21;
            })()
          }), null);
          return _el$19;
        })()
      })];
    }
  }));
}
delegateEvents(["input", "click", "mousedown"]);

var _tmpl$$4 = /* @__PURE__ */template(`<div class=topbar_container>`);
const default_timeframe_select_opts = {
  menu_listings: {
    "s": [1, 2, 5, 15, 30],
    "m": [1, 2, 5, 15, 30],
    "h": [1, 2, 4],
    "D": [1],
    "W": [1]
  },
  favorites: ["1D"]
};
function TimeframeSwitcher() {
  const id = "timeframe_selector";
  let el = document.createElement("div");
  const [selectedTF, setSelectedTF] = createSignal(new tf(1, "E"));
  const [menuLocation, setMenuLocation] = createSignal({
    x: 0,
    y: 0
  });
  const [TimeframeOpts, setTimeframeOpts] = createStore(default_timeframe_select_opts);
  const ordered_favorites = () => {
    return Array.from(TimeframeOpts.favorites, tf_str => tf.fromStr(tf_str)).sort((a, b) => a.toValue() - b.toValue());
  };
  const updateLocation = () => {
    setMenuLocation({
      x: el.getBoundingClientRect().right,
      y: el.getBoundingClientRect().bottom
    });
  };
  window.topbar.setTimeframe = setSelectedTF;
  window.api.update_timeframe_topbar_opts = setTimeframeOpts;
  function onSel(timeframe) {
    if (window.activeFrame?.ticker !== void 0) window.api.timeseries_request(window.activeContainer?.id ?? "", window.activeFrame?.id ?? "", window.activeFrame?.ticker ?? "", timeframe.toString());
  }
  OverlayCTX().attachOverlay(id, createComponent(TimeframeMenu, {
    id,
    onSel,
    opts: TimeframeOpts,
    setOpts: setTimeframeOpts,
    location: menuLocation,
    updateLocation
  }));
  return (() => {
    var _el$ = _tmpl$$4();
    var _ref$ = el;
    typeof _ref$ === "function" ? use(_ref$, _el$) : el = _el$;
    insert(_el$, createComponent(Show, {
      get when() {
        return memo(() => !!!tf.isEqual(selectedTF(), new tf(1, "E")))() && !TimeframeOpts.favorites.includes(selectedTF().toString());
      },
      get children() {
        return createComponent(TextIcon, {
          get text() {
            return selectedTF().toString(selectedTF().toValue() >= 86400);
          },
          classList: {
            timeframe_btn: true
          },
          activated: true
        });
      }
    }), null);
    insert(_el$, createComponent(For, {
      get each() {
        return ordered_favorites();
      },
      children: fav => createComponent(TextIcon, {
        get text() {
          return fav.toString(fav.toValue() >= 86400);
        },
        classList: {
          timeframe_btn: true
        },
        get activated() {
          return tf.isEqual(selectedTF(), fav);
        },
        onClick: () => onSel(fav)
      })
    }), null);
    insert(_el$, createComponent(ShowMenuButton, {
      id,
      "class": "topbar_menu_button",
      get icon_act() {
        return icons.menu_arrow_ns;
      }
    }), null);
    return _el$;
  })();
}
const default_display = /* @__PURE__ */new Map([["s", false], ["m", true], ["h", true], ["D", true], ["W", false], ["M", false], ["Y", false]]);
function TimeframeMenu(props) {
  const [, overlayDivProps] = splitProps(props, ["opts", "setOpts"]);
  const accessor = str => props.opts.menu_listings[str];
  function addFavorite(tf_str) {
    if (!props.opts.favorites.includes(tf_str)) props.setOpts("favorites", [...props.opts.favorites, tf_str]);
  }
  function removeFavorite(tf_str) {
    if (props.opts.favorites.includes(tf_str)) props.setOpts("favorites", props.opts.favorites.filter(fav => fav != tf_str));
  }
  return createComponent(OverlayDiv, mergeProps(overlayDivProps, {
    get location_ref() {
      return location_reference.TOP_RIGHT;
    },
    get children() {
      return createComponent(For, {
        get each() {
          return Object.keys(props.opts.menu_listings);
        },
        children: tf_period => createComponent(MenuSection, {
          get label() {
            return intervalMap[tf_period] + "s";
          },
          get showByDefault() {
            return default_display.get(tf_period) ?? false;
          },
          get children() {
            return createComponent(For, {
              get each() {
                return accessor(tf_period);
              },
              children: tf_mult => {
                const _tf_obj = new tf(tf_mult, tf_period);
                const _tf_str = _tf_obj.toString();
                return createComponent(MenuItem, {
                  expand: true,
                  get label() {
                    return _tf_obj.toLabel();
                  },
                  onSel: () => props.onSel(_tf_obj),
                  star: () => props.opts.favorites.includes(_tf_str),
                  starAct: () => addFavorite(_tf_str),
                  starDeact: () => removeFavorite(_tf_str)
                });
              }
            });
          }
        })
      });
    }
  }));
}

var _tmpl$$3 = /* @__PURE__ */template(`<div class="layout_main layout_flex"><div class=topbar><div class=topbar_separator></div><div class=topbar_separator></div><div class=topbar_separator></div><div class=topbar_separator></div></div><div class=topbar><div class=topbar_separator>`);
function TopBar(props) {
  return (() => {
    var _el$ = _tmpl$$3(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.nextSibling,
      _el$5 = _el$4.nextSibling,
      _el$6 = _el$5.nextSibling,
      _el$7 = _el$2.nextSibling;
      _el$7.firstChild;
    spread(_el$, props, false, true);
    insert(_el$2, createComponent(SymbolSearchBox, {}), _el$3);
    insert(_el$2, createComponent(TimeframeSwitcher, {}), _el$4);
    insert(_el$2, createComponent(SeriesSwitcher, {}), _el$5);
    insert(_el$2, createComponent(IndicatorsBox, {}), _el$6);
    insert(_el$7, createComponent(LayoutSwitcher, {}), null);
    return _el$;
  })();
}

var _tmpl$$2 = /* @__PURE__ */template(`<div class=widget_panel_title>Frame Viewer`);
const MIN_WIDTH = 156;
const MAX_WIDTH = 468;
const DEFAULT_WIDTH = 200;
function FrameViewer() {
  const displays = ContainerCTX().displays;
  const [ids, setIds] = createSignal(Array.from(activeContainer.frames, f => f.id));
  createEffect(on$1(displays, () => setIds(Array.from(activeContainer.frames, f => f.id))));
  const getTagName = id => FRAME_NAME_MAP.get(activeContainer.frames.find(f => f.id === id)?.type ?? "") ?? "";
  onMount(() => {
    WidgetPanelSizeCTX().setMinSize(MIN_WIDTH);
    WidgetPanelSizeCTX().setMaxSize(MAX_WIDTH);
    WidgetPanelSizeCTX().setSize(DEFAULT_WIDTH);
  });
  return [_tmpl$$2(), createComponent(Show, {
    get when() {
      return displays();
    },
    keyed: true,
    get children() {
      return createComponent(DraggableSelection, {
        ids,
        overlay_child: ({
          id
        }) => OverlayItemTag({
          tag_id: () => id,
          tag_name: () => getTagName(id)
        }),
        get reorder_function() {
          return activeContainer.reorderFrames.bind(activeContainer);
        },
        get children() {
          return createComponent(For, {
            get each() {
              return ids();
            },
            children: tag_id => {
              let frame2 = activeContainer.frames.find(f => f.id === tag_id);
              return createComponent(SelectableItemTag, {
                tag_id: () => tag_id,
                tag_name: () => getTagName(tag_id),
                onClick: () => frame2?.assignActiveFrame(),
                get children() {
                  return createComponent(FrameDeleteBtn, {
                    id: tag_id
                  });
                }
              });
            }
          });
        }
      });
    }
  })];
}
const FRAME_NAME_MAP = /* @__PURE__ */new Map([["abstract", "Abstract Frame"], ["charting_frame", "Charting Frame"]]);
function FrameDeleteBtn(props) {
  if (activeContainer.frames.length <= num_frames(activeContainer.layout)) return;
  return createComponent(Icon, {
    get icon() {
      return icons.close;
    },
    onClick: () => window.api.remove_frame(activeContainer.id, props.id)
  });
}

var _tmpl$$1 = /* @__PURE__ */template(`<div class="layout_main layout_flex flex_col">`),
  _tmpl$2 = /* @__PURE__ */template(`<div class="layout_main widget_panel"><div class=widget_resize_handle>`);
const [selectedWidget, setSelectedWidget] = createSignal();
function WidgetBar(props) {
  createEffect(() => {
    props.panelDisplay.display === "flex" && selectedWidget() ? props.showWidgetPanel() : props.hideWidgetPanel();
  });
  return (() => {
    var _el$ = _tmpl$$1();
    insert(_el$, createComponent(WidgetIcon, {
      get icon() {
        return icons.frame_editor;
      }
    }), null);
    insert(_el$, createComponent(WidgetIcon, {
      get icon() {
        return icons.object_tree;
      }
    }), null);
    createRenderEffect(_$p => style(_el$, props.style, _$p));
    return _el$;
  })();
}
function WidgetIcon(props) {
  return createComponent(Icon, mergeProps({
    width: 34,
    height: 34,
    classList: {
      widget_bar_icon: true
    },
    style: {
      margin: "4px",
      padding: "2px"
    },
    onClick: () => setSelectedWidget(selectedWidget() !== props.icon ? props.icon : void 0),
    get selected() {
      return selectedWidget() === props.icon;
    }
  }, props));
}
function WidgetPanel(divProps) {
  const resizePanel = WidgetPanelSizeCTX().setSize;
  const [resizing, setResizing] = createSignal(false);
  let ref = document.createElement("div");
  const resizeWidgetPanel = e => {
    resizePanel(window.innerWidth - (e.clientX + WIDGET_BAR_WIDTH + WIDGET_PANEL_MARGIN));
  };
  const onMouseDown = e => {
    if (e.target !== ref) return;
    setResizing(true);
    document.addEventListener("mousemove", resizeWidgetPanel);
    document.addEventListener("mouseup", () => {
      setResizing(false);
      document.removeEventListener("mousemove", resizeWidgetPanel);
    }, {
      once: true
    });
  };
  return (() => {
    var _el$2 = _tmpl$2(),
      _el$3 = _el$2.firstChild;
    spread(_el$2, mergeProps(divProps, {
      "onMouseDown": onMouseDown
    }), false, true);
    insert(_el$2, createComponent(Switch, {
      get children() {
        return [createComponent(Match, {
          get when() {
            return selectedWidget() === icons.frame_editor;
          },
          get children() {
            return createComponent(FrameViewer, {});
          }
        }), createComponent(Match, {
          get when() {
            return selectedWidget() === icons.object_tree;
          },
          get children() {
            return createComponent(ObjectTree, {});
          }
        })];
      }
    }), _el$3);
    var _ref$ = ref;
    typeof _ref$ === "function" ? use(_ref$, _el$3) : ref = _el$3;
    createRenderEffect(_$p => (_$p = resizing() ? "var(--hover-color)" : "") != null ? _el$3.style.setProperty("background-color", _$p) : _el$3.style.removeProperty("background-color"));
    return _el$2;
  })();
}

var _tmpl$ = /* @__PURE__ */template(`<div id=layout_wrapper class=wrapper><div class=layout_main>`);
const MARGIN = 5;
const TOP_HEIGHT = 38;
const TITLE_HEIGHT = 38;
const CENTER_PADDING = 2;
const WIDGET_BAR_WIDTH = 52;
const WIDGET_PANEL_MARGIN = 2;
const MIN_WIDGET_PANEL_WIDTH = 156;
const MAX_WIDGET_PANEL_WIDTH = 468;
const DEFAULT_WIDGET_PANEL_WIDTH = 208;
const TOOLBAR_WIDTH = 46;
const UTILBAR_WIDTH = 38;
const layout_default = {
  center: {
    width: "-1px",
    height: "-1px",
    top: `${TITLE_HEIGHT + TOP_HEIGHT + MARGIN + CENTER_PADDING}px`,
    left: `${TOOLBAR_WIDTH + MARGIN + CENTER_PADDING}px`
  },
  titlebar: {
    width: "100vw",
    height: "38px",
    top: "0px",
    left: "0px"
  },
  topbar: {
    display: "flex",
    width: "100vw",
    height: "38px",
    top: `${TITLE_HEIGHT}px`,
    left: "0px"
  },
  toolbar: {
    display: "flex",
    width: `${TOOLBAR_WIDTH}px`,
    height: "-1px",
    top: `${TITLE_HEIGHT + TOP_HEIGHT + MARGIN}px`,
    left: "0px"
  },
  widgetbar: {
    display: "flex",
    width: `${WIDGET_BAR_WIDTH}px`,
    height: "-1px",
    top: `${TITLE_HEIGHT + TOP_HEIGHT + MARGIN}px`,
    right: "0px"
  },
  widgetpanel: {
    display: "none",
    width: "-1px",
    height: "-1px",
    top: `${TITLE_HEIGHT + TOP_HEIGHT + MARGIN}px`,
    right: `${WIDGET_BAR_WIDTH + WIDGET_PANEL_MARGIN}px`
  },
  utilbar: {
    display: "flex",
    width: "-1px",
    height: `${UTILBAR_WIDTH}px`,
    bottom: "0px",
    left: `${TOOLBAR_WIDTH + MARGIN}px`
  }
};
var LAYOUT_SECTIONS = /* @__PURE__ */(LAYOUT_SECTIONS2 => {
  LAYOUT_SECTIONS2[LAYOUT_SECTIONS2["TITLE_BAR"] = 0] = "TITLE_BAR";
  LAYOUT_SECTIONS2[LAYOUT_SECTIONS2["TOP_BAR"] = 1] = "TOP_BAR";
  LAYOUT_SECTIONS2[LAYOUT_SECTIONS2["TOOL_BAR"] = 2] = "TOOL_BAR";
  LAYOUT_SECTIONS2[LAYOUT_SECTIONS2["WIDGET_BAR"] = 3] = "WIDGET_BAR";
  LAYOUT_SECTIONS2[LAYOUT_SECTIONS2["WIDGET_PANEL"] = 4] = "WIDGET_PANEL";
  LAYOUT_SECTIONS2[LAYOUT_SECTIONS2["UTIL_BAR"] = 5] = "UTIL_BAR";
  LAYOUT_SECTIONS2[LAYOUT_SECTIONS2["CENTER"] = 6] = "CENTER";
  return LAYOUT_SECTIONS2;
})(LAYOUT_SECTIONS || {});
function Wrapper() {
  const [layout, set_layout] = createStore(layout_default);
  const widgetPanelWidth = WidgetPanelSizeCTX().size;
  onMount(() => {
    window.addEventListener("resize", () => resize(window.innerWidth, window.innerHeight, layout, set_layout));
    resize(window.innerWidth, window.innerHeight, layout, set_layout);
  });
  createEffect(() => {
    resize(window.innerWidth, window.innerHeight, layout, set_layout);
  });
  createEffect(on$1(widgetPanelWidth, () => {
    resize(window.innerWidth, window.innerHeight, layout, set_layout);
  }));
  const title_bar_props = {
    show_section: show_section_unbound.bind(void 0, set_layout),
    hide_section: hide_section_unbound.bind(void 0, set_layout)
  };
  const widget_bar_props = {
    panelDisplay: layout.widgetbar,
    showWidgetPanel: show_section_unbound.bind(void 0, set_layout, 4 /* WIDGET_PANEL */),
    hideWidgetPanel: hide_section_unbound.bind(void 0, set_layout, 4 /* WIDGET_PANEL */)
  };
  return createComponent(GlobalContexts, {
    get children() {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild;
      insert(_el$, createComponent(Container, {
        get style() {
          return layout.center;
        }
      }), _el$2);
      insert(_el$, createComponent(TitleBar, mergeProps({
        get style() {
          return layout.titlebar;
        }
      }, title_bar_props)), _el$2);
      insert(_el$, createComponent(TopBar, {
        get style() {
          return layout.topbar;
        }
      }), _el$2);
      insert(_el$, createComponent(ToolBar, {
        get style() {
          return layout.toolbar;
        }
      }), _el$2);
      insert(_el$, createComponent(WidgetBar, mergeProps({
        get style() {
          return layout.widgetbar;
        }
      }, widget_bar_props)), _el$2);
      insert(_el$, createComponent(WidgetPanel, {
        get style() {
          return layout.widgetpanel;
        }
      }), _el$2);
      createRenderEffect(_$p => style(_el$2, layout.utilbar, _$p));
      return _el$;
    }
  });
}
function GlobalContexts(props) {
  return createComponent(ColorContext, {
    get children() {
      return createComponent(ToolBoxContext, {
        get children() {
          return createComponent(ObjTreeContext, {
            get children() {
              return createComponent(KeyboardListener, {
                get children() {
                  return createComponent(PanelResizeContext, {
                    widget: true,
                    get children() {
                      return createComponent(OverlayContextProvider, {
                        get children() {
                          return [createComponent(ContextMenuOverlayProvider, {}), memo(() => props.children)];
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  });
}
function resize(width, height, layout, set_layout) {
  const widgetPanelWidth = WidgetPanelSizeCTX().size();
  let side_bar_height = height - TITLE_HEIGHT;
  let center_height = height - TITLE_HEIGHT;
  let center_width = width;
  if (layout.topbar.display === "flex") {
    side_bar_height -= TOP_HEIGHT + MARGIN;
    center_height -= TOP_HEIGHT + MARGIN;
  }
  if (layout.toolbar.display === "flex") center_width -= TOOLBAR_WIDTH + MARGIN;
  if (layout.widgetbar.display === "flex") center_width -= WIDGET_BAR_WIDTH + MARGIN;
  if (layout.widgetpanel.display === "flex") center_width -= widgetPanelWidth + WIDGET_PANEL_MARGIN;
  if (layout.utilbar.display === "flex") center_height -= UTILBAR_WIDTH + MARGIN;
  set_layout("toolbar", "height", `${side_bar_height}px`);
  set_layout("widgetbar", "height", `${side_bar_height}px`);
  set_layout("widgetpanel", "height", `${side_bar_height}px`);
  set_layout("widgetpanel", "width", `${widgetPanelWidth}px`);
  set_layout("center", "height", `${center_height - 2 * CENTER_PADDING}px`);
  set_layout("center", "width", `${center_width - 2 * CENTER_PADDING}px`);
  set_layout("utilbar", "width", `${center_width}px`);
  if (window.activeContainer) window.activeContainer.refreshSize(new DOMRect(0, 0, center_width, center_height));
  let func = WidgetPanelSizeCTX().resizeFunc();
  if (func !== void 0) func(new DOMRect(0, 0, widgetPanelWidth, center_height));
  if (window.activeContainer) setTimeout(() => window.activeContainer.refreshSize(), 0);
}
function show_section_unbound(set_layout, section) {
  switch (section) {
    case 2 /* TOOL_BAR */:
      set_layout("center", "left", `${TOOLBAR_WIDTH + MARGIN + CENTER_PADDING}px`);
      set_layout("utilbar", "left", `${TOOLBAR_WIDTH + MARGIN}px`);
      set_layout("toolbar", "display", "flex");
      break;
    case 3 /* WIDGET_BAR */:
      set_layout("widgetbar", "display", "flex");
      break;
    case 4 /* WIDGET_PANEL */:
      set_layout("widgetpanel", "display", "flex");
      break;
    case 1 /* TOP_BAR */:
      set_layout("toolbar", "top", `${TITLE_HEIGHT + TOP_HEIGHT + MARGIN}px`);
      set_layout("widgetbar", "top", `${TITLE_HEIGHT + TOP_HEIGHT + MARGIN}px`);
      set_layout("center", "top", `${TITLE_HEIGHT + TOP_HEIGHT + MARGIN + CENTER_PADDING}px`);
      set_layout("topbar", "display", "flex");
      break;
    case 5 /* UTIL_BAR */:
      set_layout("utilbar", "display", "flex");
  }
  if (window.activeContainer) window.activeContainer.refreshSize();
}
function hide_section_unbound(set_layout, section) {
  switch (section) {
    case 2 /* TOOL_BAR */:
      set_layout("center", "left", `${CENTER_PADDING}px`);
      set_layout("utilbar", "left", `0px`);
      set_layout("toolbar", "display", "none");
      break;
    case 3 /* WIDGET_BAR */:
      set_layout("widgetbar", "display", "none");
      set_layout("widgetpanel", "display", "none");
      break;
    case 4 /* WIDGET_PANEL */:
      set_layout("widgetpanel", "display", "none");
      break;
    case 1 /* TOP_BAR */:
      set_layout("toolbar", "top", `${TITLE_HEIGHT}px`);
      set_layout("widgetbar", "top", `${TITLE_HEIGHT}px`);
      set_layout("center", "top", `${TITLE_HEIGHT + CENTER_PADDING}px`);
      set_layout("topbar", "display", "none");
      break;
    case 5 /* UTIL_BAR */:
      set_layout("utilbar", "display", "none");
  }
  if (window.activeContainer) window.activeContainer.refreshSize();
}
const default_resize_props = {
  size: () => 0,
  setSize: () => {},
  setMinSize: () => {},
  setMaxSize: () => {},
  resizeFunc: () => () => {},
  setResizeFunc: () => {}
};
let widgetResizeContext = createContext(default_resize_props);
function WidgetPanelSizeCTX() {
  return useContext(widgetResizeContext);
}
let utilResizeContext = createContext(default_resize_props);
function PanelResizeContext(props) {
  const PanelFunc = createSignal(rect => {});
  const PanelSize = createSignal(DEFAULT_WIDGET_PANEL_WIDTH);
  const MinPanelSize = createSignal(MIN_WIDGET_PANEL_WIDTH);
  const MaxPanelSize = createSignal(MAX_WIDGET_PANEL_WIDTH);
  const ResizeCTX = {
    size: PanelSize[0],
    //Bound the size of the widget panel
    setSize: v => {
      PanelSize[1](Math.max(Math.min(v, MaxPanelSize[0]()), MinPanelSize[0]()));
    },
    setMinSize: MinPanelSize[1],
    setMaxSize: MaxPanelSize[1],
    resizeFunc: PanelFunc[0],
    setResizeFunc: PanelFunc[1]
  };
  if (props.widget) {
    widgetResizeContext = createContext(ResizeCTX);
    return createComponent(widgetResizeContext.Provider, {
      value: ResizeCTX,
      get children() {
        return props.children;
      }
    });
  } else {
    utilResizeContext = createContext(ResizeCTX);
    return createComponent(utilResizeContext.Provider, {
      value: ResizeCTX,
      get children() {
        return props.children;
      }
    });
  }
}

class PyApi {
  close;
  maximize;
  minimize;
  restore;
  /* ---------------- Javascript >>> Python ---------------- */
  // The following functions are called by JS and hook to functions implemented in python.
  // These functions have default implementations so functionality is maintained when launched on a local dev server.
  // These are over written (re-routed) at start-up by the PyWv Class to execute their respective python functions at runtime
  // @ts-ignore                
  add_container() {
    window.container_manager.add_container(makeId(Array.from(container_manager.containers.keys()), "c_"));
  }
  // @ts-ignore
  remove_container(id) {
    window.container_manager.remove_container(id);
  }
  // @ts-ignore
  remove_frame(container_id, frame_id) {
    activeContainer.remove_frame(frame_id);
  }
  reorder_containers(from, to) {
    console.log(`reorder containers from: ${from} to: ${to} `);
  }
  layout_change(container_id, layout) {
    console.log(`Layout Change: ${container_id},${layout}`);
    const container = window.container_manager.containers.get(container_id);
    if (container === void 0) return;
    for (let i = container.frames.length; i < num_frames(container.layout); i++) container.add_frame(makeId(Array.from(container.frames, frame => frame.id), `${container_id}_f_`));
    container.set_layout(layout);
  }
  series_change(container_id, frame_id, series_type) {
    console.log(`Series Change: ${container_id},${frame_id},${series_type}`);
  }
  symbol_search(symbol, sources, exchanges, asset_classes, confirmed) {
    console.log(`Search Request: ${symbol},${sources},${exchanges},${asset_classes},${confirmed}`);
  }
  timeseries_request(container_id, frame_id, ticker2, tf) {
    console.log(`Data Request: ${container_id},${frame_id},${ticker2},${tf}`);
  }
  indicator_request(container_id, frame_id, pkg_key, ind_key) {
    console.log(`Request Indicator: ${container_id},${frame_id},${pkg_key},${ind_key}`);
  }
  set_indicator_options(container_id, frame_id, ind_id, obj) {
    console.log(`Set Indicator Options: ${container_id},${frame_id},${ind_id}`, obj);
  }
  update_series_options(container_id, frame_id, ind_id, ser_id, opts) {
    console.log(`Set Series Options: ${container_id},${frame_id},${ind_id},${ser_id}`, opts);
  }
  update_primitive_options(container_id, frame_id, par_id, prim_id, opts) {
    console.log(`Set Primitive Options: ${container_id},${frame_id},${par_id},${prim_id}`, opts);
  }
  /* ---------------- Javascript >>> Python >>> Javascript ---------------- */
  // Functions that Originate in Javascript and require Python to fulfill a promise
  resolverMap = /* @__PURE__ */new Map();
  generateResolverKey() {
    return makeId(Array.from(this.resolverMap.keys()));
  }
  // The function called by python to resolve a promise
  resolve_promise(promiseKey, data) {
    if (this.resolverMap.has(promiseKey)) {
      this.resolverMap.get(promiseKey)?.(data);
      this.resolverMap.delete(promiseKey);
    } else throw new Error(`Unknown Py/JS Promise Resolver Key : ${promiseKey}`);
  }
  //Timeout to clean up unresolved promises & prevent a memory leak
  promiseRejector(promiseKey, reject, timeout = 1e3) {
    setTimeout(() => {
      this.resolverMap.delete(promiseKey);
      console.warn("Promise Timed out");
      reject("Promise Timed out");
    }, timeout);
  }
  create_primitive(resolver_id, container_id, frame_id, type, options) {
    console.log(`Create Primitive: ${resolver_id}, ${container_id},${frame_id},${type}`, options);
  }
  create_primitive_promise(container_id, frame_id, type, options) {
    const resolverID = this.generateResolverKey();
    this.create_primitive(resolverID, container_id, frame_id, type, options);
    return new Promise((resolve, reject) => {
      this.resolverMap.set(resolverID, resolve);
      this.promiseRejector(resolverID, reject);
    });
  }
  /* ---------------- Python >>> Javascript ---------------- */
  // The following functions are called by Python. They are set by JS as the window is rendered
  setFrameless(arg) {}
  populate_search_tickers(items) {}
  set_search_filters(category, opts) {}
  populate_indicator_pkgs(packages) {}
  update_series_topbar_opts(opts) {
    console.log("Series opts:", opts);
  }
  update_layout_topbar_opts(opts) {
    console.log("Layout opts:", opts);
  }
  update_timeframe_topbar_opts(opts) {
    console.log("Timeframe opts:", opts);
  }
  set_user_colors(opts) {}
}

window.api = new PyApi();
window.Container_Layouts = Container_Layouts;
window.topbar = {
  setSeries: _ => {},
  setTimeframe: _ => {},
  setLayout: _ => {},
  setTicker: _ => {}
};
render(Wrapper, document.body);
