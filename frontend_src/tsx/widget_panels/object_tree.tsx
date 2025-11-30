
import { Accessor, createContext, createEffect, createSignal, For, JSX, onMount, Setter, Show, splitProps, useContext } from "solid-js";

import { ConstrainVerticalDrag } from "../generic_elements/draggable_selector";

import { closestCenter, createSortable, DragDropProvider, DragDropSensors, SortableProvider, transformStyle, useDragDropContext } from "@thisbeyond/solid-dnd";
import '../../css/widget_panels/object_tree.css';
import { Icon, icons } from "../generic_elements/icons";
import { WidgetPanelSizeCTX } from "../window/wrapper";

const MIN_WIDTH = 156
const MAX_WIDTH = 468
const DEFAULT_WIDTH = 250


// #region --------------------- Public Interface Definitions ----------------------- */

export const ORDERABLE = Symbol('Orderable');
export const ORDERABLE_SET = Symbol('OrderableSet');
export type DropDownModes = 'auto' | 'always' | 'toggleable'

export interface Orderable {
    [ORDERABLE]: true,
    leafProps: treeLeafInterface
}
export interface OrderableSet {
    [ORDERABLE_SET]: true,
    branchProps: treeBranchInterface
}
export interface ReorderableSet extends Orderable, OrderableSet { }


export function isOrderable(obj: unknown): obj is Orderable {
    return (obj !== null && typeof obj === 'object' && ORDERABLE in obj)
}
export function isOrderableSet(obj: unknown): obj is OrderableSet {
    return (obj !== null && typeof obj === 'object' && ORDERABLE_SET in obj)
}
export function isReorderableSet(obj: unknown): obj is ReorderableSet {
    return (obj !== null && typeof obj === 'object' && (ORDERABLE in obj && ORDERABLE_SET in obj))
}

//#endregion


// #region --------------------- Object Tree Context ----------------------- */

/**
 * The Object Tree context is retrieved by the Object Tree Side Panel and Displayed
 * The Context should be Populated by the Frame so the Objects within can be rearranged
 */
interface Tree_context_props {
    mainBranch: Accessor<treeBranchInterface>,
    setMainBranch: Setter<treeBranchInterface>,
}
const default_tree_props: Tree_context_props = {
    mainBranch: () => NULL_TREE_BRANCH_INTERFACE,
    setMainBranch: () => undefined,
}

let TreeContext = createContext<Tree_context_props>(default_tree_props)
export function ObjectTreeCTX(): Tree_context_props { return useContext(TreeContext) }

export function ObjTreeContext(props: JSX.HTMLAttributes<HTMLElement>) {
    const branchProps = createSignal<treeBranchInterface>(NULL_TREE_BRANCH_INTERFACE)
    const ObjTreeCTX: Tree_context_props = {
        mainBranch: branchProps[0],
        setMainBranch: branchProps[1],
    }

    TreeContext = createContext<Tree_context_props>(ObjTreeCTX)
    return <TreeContext.Provider value={ObjTreeCTX} children={props.children} />
}

// #endregion

/**
 * Props needed to add a branch to the Object Tree. A branch can reorder a set
 * of reorderables or can nest other branches by storing reorderable sets.
 * 
 * Objects passed in 'reorderables' should match one of the two object types.
 * 'any' is given as a valid type to silence errors related to typescript's lack
 * of duck-typing
 */
export interface treeBranchInterface {
    id: string
    branchTitle: string
    dropDownMode: DropDownModes
    moveTo: (obj: unknown) => void
    reorder: (from: number, to: number) => void
    reorderables: Accessor<(Orderable | ReorderableSet | any)[]>
}
export interface treeLeafInterface {
    id: string,
    obj: Orderable,
    leafTitle: string
    // icon?

    onLeftClick?: (e?: MouseEvent) => void
    onRightClick?: (e?: MouseEvent) => void
}

export const NULL_TREE_BRANCH_INTERFACE: treeBranchInterface = {
    id: '',
    branchTitle: '',
    dropDownMode: 'auto',
    moveTo: () => undefined,
    reorder: () => undefined,
    reorderables: () => []
}


export function ObjectTree() {
    const ctx = ObjectTreeCTX()

    onMount(() => {
        WidgetPanelSizeCTX().setMinSize(MIN_WIDTH)
        WidgetPanelSizeCTX().setMaxSize(MAX_WIDTH)
        WidgetPanelSizeCTX().setSize(DEFAULT_WIDTH)
    })

    return <>
        <div class='object_tree_title'> Object Tree </div>
        <div class='object_tree'>
            <DragDropProvider onDragEnd={handleDrag} collisionDetector={closestCenter}>
                <DragDropSensors />
                <ConstrainVerticalDrag />
                <OrderableSet {...ctx.mainBranch()} set_id={ctx.mainBranch().id + '_set'} />
            </DragDropProvider>
        </div>
    </>
}

//#region --------------------- Object Tree Inner Elements --------------------- //

interface orderableSetProps extends treeBranchInterface {
    set_id: string
}

/** Orderable Set that it, itself is not Reorderable. */
function OrderableSet(props: orderableSetProps) {
    const [ids, setIds] = createSignal<string[]>([])

    createEffect(() => {
        setIds(Array.from(props.reorderables(), (obj) => obj.id))
    })

    return <SortableProvider ids={ids()}>
        <For each={props.reorderables()}>{(obj: Orderable | ReorderableSet) => {
            if (isReorderableSet(obj))
                return <ReorderableSet {...obj.branchProps} obj={obj} set_id={props.set_id} parent={props} />
            else if (isOrderable(obj))
                return <Orderable {...obj.leafProps} obj={obj} set_id={props.set_id} parent={props} />
            else
                return undefined
        }}</For>
    </SortableProvider>
}


interface reorderableSetProps extends treeBranchInterface {
    obj: ReorderableSet, parent: treeBranchInterface, set_id: string
}

/** Set that contains reorderable things, and can be reordered itself */
function ReorderableSet(props: reorderableSetProps) {
    const [dropDown, setDropDown] = createSignal<boolean>(props.dropDownMode !== 'toggleable')
    const [data,] = splitProps(props, ['id', 'obj', 'set_id', 'moveTo', 'reorder', 'parent'])
    const state = useDragDropContext()?.[0]
    const sortable = createSortable(props.id, data)

    return <div
        class='reorderable_set'
        ref={sortable.ref}
        style={{
            ...transformStyle(sortable.transform),
            "opacity": sortable.isActiveDraggable ? '100' : undefined,
            "transition": state?.active.draggable ? "transform .025s ease-in-out" : undefined
        }}
    >
        <div
            {...sortable.dragActivators} class={'orderable_set_header'}
            onclick={handleLeftClick.bind(undefined, props.obj.leafProps)}
            oncontextmenu={handleRightClick.bind(undefined, props.obj.leafProps)}
        >
            <div class='text branch_title' innerText={props.branchTitle} />
            <Show when={props.dropDownMode === 'toggleable'}>
                <div class='drop_down_selector' onClick={() => setDropDown(!dropDown())}>
                    <Icon icon={icons.menu_arrow_ns} style={{ rotate: dropDown() ? '180deg' : '0deg' }} />
                </div>
            </Show>
        </div>
        <Show when={dropDown()}>
            <OrderableSet {...props.obj.branchProps} set_id={props.obj.branchProps.id + '_set'} />
        </Show>
    </div>
}

interface OrderableProps extends treeLeafInterface {
    obj: Orderable, parent: treeBranchInterface, set_id: string
}


/** Single Item that can have it's order changed. */
function Orderable(props: OrderableProps) {
    //Sortable is both a Draggable & a Droppable that auto reorders
    const sortable = createSortable(props.id, {
        'id': props.id,
        'obj': props.obj,
        'set_id': props.set_id,
        'parent': props.parent,
    })
    const state = useDragDropContext()?.[0]

    //@ts-ignore
    return <div use:sortable
        onclick={handleLeftClick.bind(undefined, props)}
        oncontextmenu={handleRightClick.bind(undefined, props)}
        classList={{ 'orderable': true, 'text': true }}
        innerText={props.leafTitle}
        style={{
            "opacity": sortable.isActiveDraggable ? '100' : undefined,
            "transition": state?.active.draggable ? "transform .025s ease-in-out" : undefined
        }}
    />
}

//#endregion

function handleDrag({ draggable, droppable }: any) {
    if (draggable === undefined || droppable === undefined) return

    if (draggable.data?.set_id == droppable.data?.set_id) {
        console.log('same group : Reorder')
        droppable.data?.parent?.reorder(draggable.data?.obj, droppable.data?.obj)
    } else {
        console.log('different group. Move to Parent')
        droppable.data?.moveToFunc?.(draggable.data?.obj)
    }
}

function handleRightClick(obj: treeLeafInterface, e: MouseEvent) {
    e.preventDefault()
    if (e.button == 2 && obj.onRightClick) {
        e.stopPropagation()
        obj.onRightClick(e)
    }
}

function handleLeftClick(obj: treeLeafInterface, e: MouseEvent) {
    if (e.button == 0 && obj.onLeftClick) {
        e.stopPropagation()
        obj.onLeftClick(e)
    }
}