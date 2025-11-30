import { MouseEventParams, Time } from 'lightweight-charts';
import { ChartingEvent } from '../../charting_frame';
import { VertLine, VertLineOptions } from './vert_line';


// The Controller Requires the following 3 parameters to be a valid controller.
interface VertLineControllerOptions extends Partial<VertLineOptions> {
    autosend: boolean
    submit: () => void
    update: (time: Time) => void
}

/**
 * A Vertical Line primitive that exports it's time when updated to be used as a controller elsewhere.
 */
export class VertLineController extends VertLine {

    private update: (time: Time) => void
    private submit: () => void
    private autosend: boolean

    constructor(id: string, params: VertLineControllerOptions) {
        super(id, params)
        this.autosend = params.autosend
        this.update = params.update
        this.submit = params.submit
        this.onCrosshairControl = this.onCrosshairControl.bind(this)
    }

    //Overwrite Options Menu so you don't in-advertently open a menu from a menu tool
    public displayOptionsMenu(): void { }

    onMouseDown(param: ChartingEvent): void {
        super.onMouseDown(param)

        // This function is only called when a confirmed hitTest as already occurred, so always execute the following.
        // This is circumventing the charting_frame's event delegate because it's kinda overkill for what we need to do.
        this.chartApi.subscribeCrosshairMove(this.onCrosshairControl)
        document.addEventListener('mouseup', () => {
            if (!this.autosend) this.submit() // If autosend was false, submit the change when the user releases the line.
            this.chartApi.unsubscribeCrosshairMove(this.onCrosshairControl)
        }, { once: true })
    }

    private onCrosshairControl(param: MouseEventParams) {
        if (param.time) this.update(param.time)
    }
}
