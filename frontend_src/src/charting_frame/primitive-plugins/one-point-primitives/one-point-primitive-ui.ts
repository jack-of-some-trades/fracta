/**
 * Event Listener functions that are invoked by the toolbar and the toolbox that allow
 * the user to seamlessly create a TrendLine via Mouse input.
 */

import { ITimeScaleApi, MouseEventParams, Time } from "lightweight-charts"
import { KeyboardCTX } from "../../../../tsx/window/keyboard_listener"
import { PrimitiveBase, primitiveOptions } from "../primitive-base"
import { finalizeToolCreation } from "../tool_ui_support"
import { OnePointPrimitive } from "./one-point-primitive"

let mouseMoveController = new AbortController()
export function cleanUpOnePointTool(){ mouseMoveController.abort() }

export function configureOnePointPrimitiveUI<T extends primitiveOptions>(e:MouseEvent, new_primitive: OnePointPrimitive<T>): PrimitiveBase | null {
    //Set First point to where this click originated
    let p = new_primitive.series.coordinateToPrice(e.offsetY)
    let t = new_primitive.chart.timeScale().coordinateToTime(e.offsetX)
    
    if (t === null || p === null){
        new_primitive.remove()
        console.warn('Failed to create Primitive, Price or Time invalid', new_primitive)
        return null
    }
    new_primitive.updateData({p1:{time:t, value:p}})
    
    if (KeyboardCTX().ctrl()) {
        // If Ctrl was held, finalize the primitive creation immediately
        // Notably without calling primitive.remove()
        return null 
    }

    //Add Clean-up Logic for the remaining Event Listener
    mouseMoveController = new AbortController()

    //Setup Listeners to update the point
    const timescale = new_primitive.chart.timeScale()
    const bound_update_ref = updatePoint.bind(new_primitive, timescale)
    new_primitive.chart.subscribeCrosshairMove(bound_update_ref)

    mouseMoveController.signal.addEventListener('abort', () => {
        new_primitive.chart.unsubscribeCrosshairMove(bound_update_ref)
    }, {once: true})

    // mount 'click' listener on 'click' event so the second point is only confirmed w/ a second click.
    document.addEventListener('click', () => {
        new_primitive.chart.chartElement().addEventListener(
            'click', confirmPoint, {signal:mouseMoveController.signal}
        )
    }, {once: true})

    return new_primitive
}

function confirmPoint(e:MouseEvent){
    if (e.button !== 0) return //Left mouseBtn listener

    //All primitive tools need to call finalize once they are done.
    cleanUpOnePointTool()
    finalizeToolCreation()
}


function updatePoint<T extends primitiveOptions>(
    this:OnePointPrimitive<T>, timescale:ITimeScaleApi<Time>, param:MouseEventParams<Time>
){
    if (!param.point) return

    let t = timescale.coordinateToTime(param.point.x)
    let p = this.series.coordinateToPrice(param.point.y)
    if (t && p)
        this.updateData({p1:{ time: t, value: p }})
}