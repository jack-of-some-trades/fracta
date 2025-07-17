import * as lwc from "lightweight-charts";
import { Accessor, createSignal, Setter } from "solid-js";
import { icons } from "../../tsx/generic_elements/icons";
import { ORDERABLE, ORDERABLE_SET, ReorderableSet, treeBranchInterface, treeLeafInterface } from "../../tsx/widget_panels/object_tree";
import { contextMenuItem, MenuContextListener } from "../../tsx/window/context_menu";
import { deriveShortcuts, KeyboardCTX, keyboardShortcut } from "../../tsx/window/keyboard_listener";
import { charting_frame } from "./charting_frame";
import { indicator, isIndicator } from "./indicator";
import { PrimitiveBase } from "./primitive-plugins/primitive-base";
import { isPrimitiveSet, PrimitiveSet } from "./primitive-plugins/primitive-set";
import { SeriesApi, SeriesDefinitions } from "./series-plugins/series-base";


export const MIN_PANE_HEIGHT = 30
/**
 * Class to wrap around the IPaneAPI created by the chart. This class helps
 * manage the ability to order indicators/primitives within a pane.
 */
export class charting_pane implements ReorderableSet {
    [ORDERABLE]:true = true;
    [ORDERABLE_SET]:true = true;

    _pane: lwc.IPaneApi<lwc.Time>
    _frame: charting_frame

    paneEl: Accessor<HTMLTableCellElement | undefined>
    private setPaneEl: Setter<HTMLTableCellElement | undefined>

    series_primitives: PrimitiveSet | undefined
    attached: Accessor<(indicator | PrimitiveSet)[]>
    setAttached: Setter<(indicator | PrimitiveSet)[]>

    stretchFactorMemory: number = 1
    maximized: Accessor<boolean>
    private setMaximized: Setter<boolean>
    minimized: Accessor<boolean>
    setMinimized: Setter<boolean>

    leafProps: treeLeafInterface
    branchProps: treeBranchInterface
    shortcuts: keyboardShortcut[]
    ctxMenuStruct: contextMenuItem[][]
    ctxMenuCleaner = new AbortController()
    
    constructor(frame: charting_frame, pane: lwc.IPaneApi<lwc.Time>){
        this._pane = pane
        this._frame = frame

        this.series_primitives = new PrimitiveSet(this)

        const sig1 = createSignal<HTMLTableCellElement>()
        this.paneEl = sig1[0]; this.setPaneEl = sig1[1]
        const sig2 = createSignal<(indicator | PrimitiveSet)[]>([])
        this.attached = sig2[0]; this.setAttached = sig2[1]
        const sig3 = createSignal<boolean>(false)
        this.maximized = sig3[0]; this.setMaximized = sig3[1]
        const sig4 = createSignal<boolean>(false)
        this.minimized = sig4[0]; this.setMinimized = sig4[1]

        this.leafProps = {
            obj: this,
            id:this.id,
            leafTitle:this.name
        }
        this.branchProps = {
            id: this.id,
            branchTitle: this.name,
            dropDownMode: 'always',
            reorderables: this.attached,
            moveTo: this.moveToPane.bind(this),
            reorder: this.reorderAttached.bind(this),
        }
        this.ctxMenuStruct = generateContextMenuStruct(this)
        this.shortcuts = deriveShortcuts(this.ctxMenuStruct)
    }

    
    onActivation() { // When the Pane has been clicked on
        KeyboardCTX().attachHandler(this.id, this.shortcuts)
    }

    onDeactivation() {
        KeyboardCTX().detachHandler(this.id)
    }

    get id():string { return String(this._pane.paneIndex()) }
    get name(): string {return 'Pane #' + String(this.id)}
    get frame(): charting_frame { return this._frame }
    get paneIndex(): number { return this._pane.paneIndex() }
    get paneApi(): lwc.IPaneApi<lwc.Time> { return this._pane }
    get _paneEl(): HTMLTableCellElement | undefined {
        if (this._pane.getHTMLElement()) return this._pane.getHTMLElement() as HTMLTableCellElement
    }
    get _leftAxisEl(): HTMLTableCellElement | undefined {
        const _el = this._pane.getHTMLElement()?.querySelector("td:nth-child(1)")
        if (_el) return _el as HTMLTableCellElement
    }
    get _chartEl(): HTMLTableCellElement | undefined {
        const _el = this._pane.getHTMLElement()?.querySelector("td:nth-child(2)")
        if (_el) return _el as HTMLTableCellElement
    }
    get _rightAxisEl(): HTMLTableCellElement | undefined {
        const _el = this._pane.getHTMLElement()?.querySelector("td:nth-child(3)")
        if (_el) return _el as HTMLTableCellElement
    }

    _updatePaneEl(){
        requestAnimationFrame(() => {
            this.setPaneEl(this._paneEl)
            this._recordStretchFactor()

            // Refresh the ctxMenuListener for the pane
            this.ctxMenuCleaner.abort()
            this.ctxMenuCleaner = new AbortController()
            this._paneEl?.addEventListener(
                'contextmenu', 
                MenuContextListener.bind(this.ctxMenuStruct),
                {signal: this.ctxMenuCleaner.signal, capture:true}
            )
        })
    }

    movePane(index: number) {
        if (index === this.paneIndex) return
        this._frame.reorderPanes(this.paneIndex, index)
    }

    _recordStretchFactor() { this.stretchFactorMemory = this.paneApi.getStretchFactor() } 

    _minimizePane(){ 
        // This is a bit bugged at the moment due to how lwc renders when setting height
        this.paneApi.setHeight(MIN_PANE_HEIGHT)
        this.setMaximized(false); this.setMinimized(true);
    }
    _restorePane() {
        this.paneApi.setStretchFactor(this.stretchFactorMemory)
        this.setMaximized(false); this.setMinimized(false);
    }
    _maximizePane() {
        this.paneApi.setStretchFactor(1)
        this.setMaximized(true); this.setMinimized(false);
    }
    _hidePane() {
        this.paneApi.setStretchFactor(0)
        this.setMaximized(false); this.setMinimized(true);
    }

    // TODO: Expand this functionality to match primitive base if pane Primitives become more readily used.
    _attachPanePrimitive(primitive: lwc.IPanePrimitive){ this._pane.attachPrimitive(primitive) }
    _detachPanePrimitive(primitive: lwc.IPanePrimitive){ this._pane.detachPrimitive(primitive) }
    _attachSeriesPrimitive(primitive: PrimitiveBase){ this.series_primitives?.attachPrimitive(primitive) }
    _detachSeriesPrimitive(primitive: PrimitiveBase){ this.series_primitives?.detachPrimitive(primitive) }
    _addSeries(type: SeriesDefinitions): SeriesApi { return this._pane.addSeries(type) }
    _addCustomSeries(impl: lwc.ICustomSeriesPaneView): SeriesApi { return this._pane.addCustomSeries(impl) }
    _priceScale(scale: string): lwc.IPriceScaleApi { return this._pane.priceScale(scale) }

    indicators(): indicator[] { return this.attached().filter((obj) => isIndicator(obj))}
    primitiveSets(): PrimitiveSet[] { return this.attached().filter((obj) => isPrimitiveSet(obj))}

    attach(obj: indicator | PrimitiveSet){
        this.setAttached([...this.attached(), obj])
    }
    
    detach(obj: indicator | PrimitiveSet){
        this.setAttached([...this.attached().filter(_obj => _obj !== obj)])
    }

    reorderAttached(from: indicator | PrimitiveSet | any, to: indicator | PrimitiveSet | any): void {
        console.log(`Reorder Indicators: from: ${from}, to: ${to}`)
    }

    moveToPane(obj: indicator | PrimitiveSet | any){

    }
}


function generateContextMenuStruct(pane:charting_pane):contextMenuItem[][] {
    return [[
        {
            icon: icons.menu_arrow_sn,
            title: 'Move Pane Up',
            execute: () => pane.movePane(pane.paneIndex - 1),
            disable: () => pane.paneIndex === 0,
            ctrl: true,
            hotkey: 'ArrowUp',
        },
        {
            icon: icons.menu_arrow_ns,
            title: 'Move Pane Down',
            execute: () => pane.movePane(pane.paneIndex + 1),
            disable: () => pane.paneIndex === pane.frame.panes().length - 1,
            ctrl: true,
            hotkey: 'ArrowDown',
        },
    ]]
}