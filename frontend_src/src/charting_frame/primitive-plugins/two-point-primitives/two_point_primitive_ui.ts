/**
 * Event Listener functions that are invoked by the toolbar and the toolbox that allow
 * the user to seamlessly create a TrendLine via Mouse input.
 */

import { ITimeScaleApi, MouseEventParams, SingleValueData, Time } from "lightweight-charts"
import { finalizeToolCreation } from "../tool_ui_support"
import { TwoPointParameters, TwoPointPrimitive } from "./two_point_primitive"

let mouseMoveController = new AbortController()
export function cleanUpTwoPointTool() { mouseMoveController.abort() }

export function configureTwoPointPrimitiveUI<T extends TwoPointParameters>(e: MouseEvent, new_primitive: TwoPointPrimitive<T>): TwoPointPrimitive<T> | null {
    //Set First point to where this click originated
    let p = new_primitive.series.coordinateToPrice(e.offsetY)
    let t = new_primitive.chartApi.timeScale().coordinateToTime(e.offsetX)

    if (t === null || p === null) {
        new_primitive.remove()
        console.warn('Failed to create Primitive, Price or Time invalid', new_primitive)
        return null
    }
    // Set both the points to the current value so it is displayed
    new_primitive.applyOptions({
        p1: { time: t, value: p } as SingleValueData,
        p2: { time: t, value: p } as SingleValueData
    } as Partial<T>
    )

    //Add Clean-up Logic for the remaining Event Listener
    mouseMoveController = new AbortController()

    //Setup Listeners to update the second point
    const timescale = new_primitive.chartApi.timeScale()
    // @ts-ignore - Sometimes you just gotta accept that you can satisfy the compiler
    const bound_update_ref = updateSecondPoint.bind(new_primitive, timescale)
    new_primitive.chartApi.subscribeCrosshairMove(bound_update_ref)

    mouseMoveController.signal.addEventListener('abort', () => {
        new_primitive.chartApi.unsubscribeCrosshairMove(bound_update_ref)
    }, { once: true })

    // mount 'click' listener on 'click' event so the second point is only confirmed w/ a second click.
    document.addEventListener('click', () => {
        new_primitive.chartApi.chartElement().addEventListener(
            'click', confirmSecondPoint, { signal: mouseMoveController.signal }
        )
    }, { once: true })

    return new_primitive
}

function confirmSecondPoint(e: MouseEvent) {
    if (e.button !== 0) return //Left mouseBtn listener

    //All primitive tools need to call finalize once they are done.
    cleanUpTwoPointTool()
    finalizeToolCreation()
}


function updateSecondPoint<T extends TwoPointParameters>(
    this: TwoPointPrimitive<T>, timescale: ITimeScaleApi<Time>, param: MouseEventParams<Time>
) {
    if (!param.point) return

    let t = timescale.coordinateToTime(param.point.x)
    let p = this.series.coordinateToPrice(param.point.y)
    if (t && p)
        this.applyOptions({ p2: { time: t, value: p } as SingleValueData } as Partial<T>)
}