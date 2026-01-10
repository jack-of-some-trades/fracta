/**
 * Event Listener functions that are invoked by the toolbar and the toolbox that allow
 * the user to seamlessly create a TrendLine via Mouse input.
 */

import { ITimeScaleApi, MouseEventParams, SingleValueData, Time } from "lightweight-charts"
import { KeyboardCTX } from "../../../../tsx/window/keyboard_listener"
import { finalizeToolCreation } from "../tool_ui_support"
import { OnePointParameters, OnePointPrimitive } from "./one-point-primitive"

let mouseMoveController = new AbortController()
export function cleanUpOnePointTool() { mouseMoveController.abort() }

export function configureOnePointPrimitiveUI<T extends OnePointParameters>(e: MouseEvent, new_primitive: OnePointPrimitive<T>): OnePointPrimitive<T> | null {
    //Set First point to where this click originated
    let p = new_primitive.series.coordinateToPrice(e.offsetY)
    let t = new_primitive.chartApi.timeScale().coordinateToTime(e.offsetX)

    if (t === null || p === null) {
        new_primitive.remove()
        console.warn('Failed to create Primitive, Price or Time invalid', new_primitive)
        return null
    }
    new_primitive.applyOptions({ p1: { time: t, value: p } as SingleValueData } as Partial<T>)

    if (KeyboardCTX().ctrl()) {
        // If Ctrl was held, finalize the primitive creation immediately
        // Notably without calling primitive.remove()
        return null
    }

    //Add Clean-up Logic for the remaining Event Listener
    mouseMoveController = new AbortController()

    //Setup Listeners to update the point
    const timescale = new_primitive.chartApi.timeScale()
    // @ts-ignore - Sometimes you just gotta accept that you can satisfy the compiler
    const bound_update_ref = updatePoint.bind(new_primitive, timescale)
    new_primitive.chartApi.subscribeCrosshairMove(bound_update_ref)

    mouseMoveController.signal.addEventListener('abort', () => {
        new_primitive.chartApi.unsubscribeCrosshairMove(bound_update_ref)
    }, { once: true })

    // mount 'click' listener on 'click' event so the second point is only confirmed w/ a second click.
    document.addEventListener('click', () => {
        new_primitive.chartApi.chartElement().addEventListener(
            'click', confirmPoint, { signal: mouseMoveController.signal }
        )
    }, { once: true })

    return new_primitive
}

function confirmPoint(e: MouseEvent) {
    if (e.button !== 0) return //Left mouseBtn listener

    //All primitive tools need to call finalize once they are done.
    cleanUpOnePointTool()
    finalizeToolCreation()
}


function updatePoint<T extends OnePointParameters>(
    this: OnePointPrimitive<T>, timescale: ITimeScaleApi<Time>, param: MouseEventParams<Time>
) {
    if (!param.point) return

    let t = timescale.coordinateToTime(param.point.x)
    let p = this.series.coordinateToPrice(param.point.y)
    if (t && p)
        this.applyOptions({ p1: { time: t, value: p } as SingleValueData } as Partial<T>)
}