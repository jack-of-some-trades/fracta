
// #region ---------------- Classes & Interfaces ---------------- //

export type MouseEventKeys = KeysOfType<HTMLElementEventMap, MouseEvent>
export type KeysOfType<T, ValueType> = {[K in keyof T]: T[K] extends ValueType ? K : never }[keyof T];

/* Represents information about a specific Ticker */
export interface ticker {
    symbol: string
    name?: string
    source?: string
    exchange?: string
    asset_class?: string
    attrs?: Object
}

const intervalList: interval[] = ["s", "m", "h", "D", "W", "M", "Y"]
const intervalValMap = { "s": 1, "m": 60, "h": 3600, "D": 86400, "W": 604800, "M": 2629743, "Y": 31556926, "E": -1 }
export type interval = "s" | "m" | "h" | "D" | "W" | "M" | "Y" | "E"
export const intervalMap = { "s": "Second", "m": "Minute", "h": "Hour", "D": "Day", "W": "Week", "M": "Month", "Y": "Year", "E": "Error" }
/**
 * An object that represents a given timeframe
 */
export class tf {
    multiplier: number
    period: interval

    constructor(mult: number, period: interval) {
        this.multiplier = Math.floor(mult)
        this.period = period
    }

    /**
     * Create a Timeframe Object from a string
     */
    static fromStr(str_in: string): tf {
        let interval_str = str_in.charAt(str_in.length - 1)
        if (!intervalList.includes(interval_str as interval))
            return new tf(-1, 'E') //Signal an error

        let mult_str = str_in.split(interval_str)[0]
        let mult_num = mult_str === "" ? 1 : parseFloat(mult_str)
        return new tf(mult_num, interval_str as interval)
    }

    /**
     * Create a Timeframe object from the given number. This is the inverse operation of .toValue(), 
     * i.e tf.from_value(new tf(1, 'D').toValue()) === new tf(1, 'D')
     * 
     * The value given is rounded down to the nearest integer multiple timeframe. e.g. (tf.from_value(new tf(1, 'D').toValue() - 1) === new tf(23, 'h'))
     * @param val The number of seconds within the given timeframe.
     */
    static fromValue(val: number): tf {
        for (let i = intervalList.length - 1; i >= 0; i--) {
            let mult = (val / intervalValMap[intervalList[i]])
            if (mult >= 1) {
                //Highest Tf interval found
                return new tf(Math.round(mult), intervalList[i])
            }
        }

        return new tf(-1, 'E') //Signal an error
    }

    static isEqual(a:tf, b:tf):boolean { return a.toValue() === b.toValue()}

    //Trim_unit can be set to True when displaying the timeframe. Should be set to false when transmitting the TF as a string.
    toString(trim_unit:boolean = false): string { return `${(trim_unit && this.multiplier === 1)? '' : this.multiplier}${this.period}` }
    toLabel(): string { return `${this.multiplier} ${intervalMap[this.period]}${(this.multiplier > 1) ? 's' : ''}` }
    toValue(): number { return this.multiplier * intervalValMap[this.period] }
}

//#endregion 


// #region ---------------- Event Delegate & Callback Types ---------------- //

export type Callback<T1 = void, T2 = void, T3 = void> = (param1: T1, param2: T2, param3: T3) => void;

export interface ISubscription<T1 = void, T2 = void, T3 = void> {
	subscribe(callback: Callback<T1, T2, T3>, linkedObject?: unknown, singleshot?: boolean): void;
	unsubscribe(callback: Callback<T1, T2, T3>): void;
	unsubscribeAll(linkedObject: unknown): void;
}

interface Listener<T1, T2, T3> {
	callback: Callback<T1, T2, T3>;
	linkedObject?: unknown;
	singleshot: boolean;
}

export class Delegate<T1 = void, T2 = void, T3 = void> implements ISubscription<T1, T2, T3> {
	private _listeners: Listener<T1, T2, T3>[] = [];
	hasListeners(): boolean { return this._listeners.length > 0 }
	clear() { this._listeners = [] }

	subscribe(callback: Callback<T1, T2, T3>, linkedObject?: unknown, singleshot?: boolean): void {
		const listener: Listener<T1, T2, T3> = {
			callback,
			linkedObject,
			singleshot: singleshot === true,
		};
		this._listeners.push(listener);
	}

	unsubscribe(callback: Callback<T1, T2, T3>): void {
		const index = this._listeners.findIndex((listener: Listener<T1, T2, T3>) => callback === listener.callback)
		if (index > -1) this._listeners.splice(index, 1)
	}

    /* unsubscribe all but the callbacks associated with the given object */
	unsubscribeAll(linkedObject: unknown): void {
		this._listeners = this._listeners.filter((listener: Listener<T1, T2, T3>) => listener.linkedObject !== linkedObject)
	}

	fire(param1: T1, param2: T2, param3: T3): void {
		const listenersSnapshot = [...this._listeners]
		this._listeners = this._listeners.filter((listener: Listener<T1, T2, T3>) => !listener.singleshot)
		listenersSnapshot.forEach((listener: Listener<T1, T2, T3>) => listener.callback(param1, param2, param3))
	}
}

//#endregion


// #region ---------------- Util Functions ---------------- //

export function arraySwap<T>(array:T[], from:number, to:number){ array[from] = [array[to], array[to] = array[from]][0] }

const ID_LEN = 4
/**
 * Generate a unique ID of Random characters that is not present in the given list.
 * @param prefix Optional prefix to affix at the start of the id
 * @param IDs List of ID's to check for collisions against
 * @returns The new ID. The ID is *not* automatically appended to the id_list
 */
export function makeId(IDs: string[], prefix: string = ''): string {
    let result = prefix;
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < ID_LEN) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    if (IDs.includes(result))
        //Generate again if there's a collision
        return makeId(IDs, prefix)
    else {
        return result;
    }
}

/**
 * Simple Binary Search
 * @param arr Array of any type
 * @param el Element to Search for
 * @param compare_fn Comparison Function that should return a number.
 * @returns Index of the found element, or when negative, the index where the element should be inserted at.
 */
export function binarySearch(arr:Array<any>, el:any, compare_fn:(a:any, b:any) => number) {
    let m = 0;
    let n = arr.length - 1;
    while (m <= n) {
        let k = (n + m) >> 1;
        let cmp = compare_fn(el, arr[k]);

        if (cmp > 0) m = k + 1
        else if(cmp < 0) n = k - 1
        else return k
    }
    return ~m;
}


/**
 * @param style RGBA or Hex Color String
 * @param opacity Opacity bounded [0, 1]
 * @returns rgba Color string with opacity applied if not given
 */
export function applyOpacity(style: string, opacity?: number): string | undefined {
  const colorValue = style.trim();
  if (!colorValue) return undefined;

  const rgbaMatch = colorValue.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const finalOpacity = a !== undefined ? a : opacity ?? 1;
    return `rgba(${r}, ${g}, ${b}, ${finalOpacity})`;
  }

  const hexMatch = colorValue.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = parseInt(hex.slice(6, 8), 16) / 255;
    if (isNaN(a))
        return `rgba(${r}, ${g}, ${b}, ${opacity ?? 1})`;
    else
        return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return undefined;
}



function padZeros (num:number){ return String(num).padStart(2,'0') }

/**
 * @param timestamp Unixtimestamp: integer # of seconds since 1970-01-01
 * @param include_Z Boolean: Include the trailing 'Z' timezone char
 * @returns Given timestamp as a string timestamp in the form YYYY-MM-DDThh:mm:ssZ
 */
export function UnixToString(timestamp: number | string, include_Z: boolean = false){ 
    let d = new Date(typeof timestamp == 'string' ? timestamp : timestamp * 1000) 

    return [
        d.getUTCFullYear(), "-",
        padZeros(d.getUTCMonth() + 1) , "-",
        padZeros(d.getUTCDate()), "T",
        padZeros(d.getUTCHours()), ":",
        padZeros(d.getUTCMinutes()), ":",
        padZeros(d.getSeconds()), include_Z ? 'Z' : ''
    ].join("")
}

export function DateStringToUnix(timestamp:string){
    const d = new Date(timestamp)
    return Math.floor((d.getTime()/1000) - (d.getTimezoneOffset()*60))
}

//#endregion

