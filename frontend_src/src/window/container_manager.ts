/**
 * Container Manager handles the creation, deletion, and display of Containers and their
 * respective Tabs at the top of the window. This file also contains the code required to
 * display and manipulate the Tabs visible at the top of the screen.
 */

import { container } from "./container"

const Draggabilly = require('draggabilly')

export interface TabProperties {
    title?: string,
    price?: string,
    favicon?: string | null
}
const defaultTabProperties: TabProperties = {
    title: '',
    favicon: null
}

/**
 * This Class creates and manages the Tabs bar and the containers those tabs represent
 * Class handles Tab movement, Addition, and removal. 
 */
export class container_manager {
    private containers: Map<string, container> = new Map()
    private tab_els: Map<string, HTMLDivElement> = new Map()

    constructor(
        tabs_el: HTMLDivElement
    ) {
        this.tab_manager.init(tabs_el)
    }

    /**
     * Generate a new container and makes it the window's active container 
     * Protected to indicate it should only be called from Python
     */
    protected add_container(id: string): container | undefined {
        const new_tab_el = this.tab_manager.addTab(id)
        const tmp_ref = new container(
            id,
            this.tab_manager.updateTab.bind(undefined, new_tab_el)
        )
        this.tab_els.set(id, new_tab_el)
        this.containers.set(id, tmp_ref)

        this.set_active_container(id)
        return tmp_ref
    }

    /**
     * Removes a Container, and all its children, from the entire interface.
     * Protected method that should only be called from Python
     */
    protected remove_container(id: string) {
        const tab_el = this.tab_els.get(id)
        const container_obj = this.containers.get(id)

        if (container_obj) {
            container_obj.remove()
        }
        if (tab_el) this.tab_manager.removeTab(tab_el)

        this.tab_els.delete(id)
        this.containers.delete(id)
    }

    /**
     * Changes which container is displayed by the app.
     */
    set_active_container(id: string) {
        const container_obj = this.containers.get(id)
        if (container_obj === undefined || container_obj === window.activeContainer) return
        const tab_el = this.tab_els.get(id)
        if (tab_el) this.tab_manager.setCurrentTab(tab_el)

        if (window.activeContainer) {
            window.activeContainer.onHide()     // Allow Sub-classes to inject behavior
        }

        window.activeContainer = container_obj
        container_obj.onShow()                   // Allow Sub-classes to inject behavior
        container_obj.refreshSize()                   // Non-Active Containers aren't resized
    }

    /**
     * Private Inner Class to separate the responsibility of animating, sizing, and updating
     * Each tab Object. This is an immediately invoked class that requires initialization before use.
     */
    private tab_manager = new class {
        el: HTMLDivElement
        styleEl: HTMLStyleElement
        isDragging: boolean                 //@ts-ignore
        draggabillies: Draggabilly[]        //@ts-ignore
        draggabillyDragging: Draggabilly | null = null

        constructor() {
            this.draggabillies = []
            this.isDragging = false
            this.el = document.createElement('div')
            this.styleEl = document.createElement('style')
        }

        init(tabs_el: HTMLDivElement) {
            this.el = tabs_el
            this.el.style.setProperty('--tab-content-margin', `${TAB_CONTENT_MARGIN}px`)
            this.el.appendChild(this.styleEl)

            //Resize listener
            window.addEventListener('resize', () => {
                this.cleanUpPreviouslyDraggedTabs()
                this.layoutTabs()
            })
            //Add Tab on Double Click
            this.el.addEventListener('dblclick', event => {
                if (event.target === this.el || event.target === this.tabContentEl)
                    //Sends the command back to python for python to create the container so the two stay synced
                    window.api.add_container()
            })

            this.layoutTabs()
            this.setupDraggabilly()
        }

        get activeTabEl() { return this.el.querySelector('.tab[active]') }
        get tabContentEl() { return this.el.querySelector('.tabs-content') as HTMLDivElement }
        private get tabEls() { return Array.prototype.slice.call(this.el.querySelectorAll('.tab')) }

        private get tabContentWidths() {
            const numberOfTabs = this.tabEls.length
            const tabsContentWidth = this.tabContentEl.clientWidth
            const tabsCumulativeOverlappedWidth = (numberOfTabs - 1) * TAB_CONTENT_OVERLAP_DISTANCE
            const targetWidth = (tabsContentWidth - (2 * TAB_CONTENT_MARGIN) + tabsCumulativeOverlappedWidth) / numberOfTabs
            const clampedTargetWidth = Math.floor(Math.max(TAB_CONTENT_MIN_WIDTH, Math.min(TAB_CONTENT_MAX_WIDTH, targetWidth)))
            const totalTabsWidthUsingTarget = (clampedTargetWidth * numberOfTabs) + (2 * TAB_CONTENT_MARGIN) - tabsCumulativeOverlappedWidth
            const totalExtraWidthDueToFlooring = tabsContentWidth - totalTabsWidthUsingTarget

            const widths: number[] = []
            let extraWidthRemaining = totalExtraWidthDueToFlooring
            for (let i = 0; i < numberOfTabs; i += 1) {
                const extraWidth = clampedTargetWidth < TAB_CONTENT_MAX_WIDTH && extraWidthRemaining > 0 ? 1 : 0
                widths.push(clampedTargetWidth + extraWidth)
                if (extraWidthRemaining > 0) extraWidthRemaining -= 1
            }

            return widths
        }

        private get tabContentPositions() {
            const positions: number[] = []
            const tabContentWidths = this.tabContentWidths

            let position = TAB_CONTENT_MARGIN
            tabContentWidths.forEach((width, i) => {
                const offset = i * TAB_CONTENT_OVERLAP_DISTANCE
                positions.push(position - offset)
                position += width
            })

            return positions
        }

        private get tabPositions() {
            const positions: number[] = []

            this.tabContentPositions.forEach((contentPosition) => {
                positions.push(contentPosition - TAB_CONTENT_MARGIN)
            })
            return positions
        }

        private layoutTabs() {
            const tabContentWidths = this.tabContentWidths

            this.tabEls.forEach((tabEl, i) => {
                const contentWidth = tabContentWidths[i]
                const width = contentWidth + (2 * TAB_CONTENT_MARGIN)
                tabEl.style.width = width + 'px'
                tabEl.removeAttribute('is-mini')
                tabEl.removeAttribute('is-small')
                tabEl.removeAttribute('is-smaller')

                if (contentWidth < TAB_SIZE_MINI) tabEl.setAttribute('is-mini', '')
                if (contentWidth < TAB_SIZE_SMALL) tabEl.setAttribute('is-small', '')
                if (contentWidth < TAB_SIZE_SMALLER) tabEl.setAttribute('is-smaller', '')
            })

            let styleHTML = ''
            this.tabPositions.forEach((position, i) => {
                styleHTML += `.tabs .tab:nth-child(${i + 1}) {transform: translate3d(${position}px, 0, 0)} `
            })
            this.styleEl.innerHTML = styleHTML
        }

        private createNewTabEl() {
            const div = document.createElement('div')
            div.innerHTML = tabTemplate
            return div.firstElementChild as HTMLDivElement
        }

        addTab(container_id: string, { animate = true, background = false } = {}): HTMLDivElement {
            const tabEl = this.createNewTabEl()
            tabEl.setAttribute('data-id', container_id)

            if (animate) {
                tabEl.classList.add('tab-was-just-added')
                setTimeout(() => tabEl.classList.remove('tab-was-just-added'), 500)
            }

            this.tabContentEl.appendChild(tabEl)
            this.updateTab(tabEl, defaultTabProperties.title, defaultTabProperties.price, defaultTabProperties.favicon)

            if (!background) this.setCurrentTab(tabEl)
            this.cleanUpPreviouslyDraggedTabs()
            this.layoutTabs()
            this.setupDraggabilly()

            //Set Close Event Listener
            let close_div = tabEl.querySelector('.tab-close') as HTMLDivElement
            close_div.addEventListener('click', () => { window.api.remove_container(container_id) })

            return tabEl
        }

        hasActiveTab() {
            return !!this.activeTabEl
        }

        setCurrentTab(tabEl: HTMLDivElement) {
            const activeTabEl = this.activeTabEl
            if (activeTabEl === tabEl) return
            if (activeTabEl) activeTabEl.removeAttribute('active')
            tabEl.setAttribute('active', '')
        }

        removeTab(tabEl: HTMLDivElement) {
            //This is the only place in Javascript that knows the order of the tabs so it 
            //must set the next active tab if the active tab is deleted
            if (tabEl === this.activeTabEl) {
                if (tabEl.nextElementSibling) {
                    window.container_manager.set_active_container(tabEl.nextElementSibling.getAttribute('data-id')!)
                } else if (tabEl.previousElementSibling) {
                    window.container_manager.set_active_container(tabEl.previousElementSibling.getAttribute('data-id')!)
                }
            }
            tabEl.remove()
            this.cleanUpPreviouslyDraggedTabs()
            this.layoutTabs()
            this.setupDraggabilly()
        }

        updateTab(tabEl: HTMLDivElement, title?: string, price?: string, favicon?: string | null) {
            const tab_title = tabEl.querySelector('.tab-title') as HTMLDivElement
            const tab_price = tabEl.querySelector('.tab-price') as HTMLDivElement
            tab_title.textContent = title ?? ""
            if (price) {
                tab_price.textContent = price
                tab_price.removeAttribute('empty')
            } else {
                tab_price.setAttribute('empty', '')
            }

            const faviconEl = tabEl.querySelector('.tab-favicon') as HTMLDivElement
            if (favicon) {
                faviconEl.style.backgroundImage = `url('${favicon}')`
                faviconEl.removeAttribute('hidden')
            } else {
                faviconEl.setAttribute('hidden', '')
                faviconEl.removeAttribute('style')
            }
        }

        cleanUpPreviouslyDraggedTabs() {
            this.tabEls.forEach((tabEl) => tabEl.classList.remove('tab-was-just-dragged'))
        }

        setupDraggabilly() {
            const tabEls = this.tabEls
            const tabPositions = this.tabPositions

            if (this.isDragging) {
                this.isDragging = false
                this.el.classList.remove('tabs-is-sorting')
                this.draggabillyDragging.element.classList.remove('tab-is-dragging')
                this.draggabillyDragging.element.style.transform = ''
                this.draggabillyDragging.dragEnd()
                this.draggabillyDragging.isDragging = false
                this.draggabillyDragging.positionDrag = () => { } // Prevent Draggabilly from updating tabEl.style.transform in later frames
                this.draggabillyDragging.destroy()
                this.draggabillyDragging = null
            }

            this.draggabillies.forEach(d => d.destroy())

            tabEls.forEach((tabEl, originalIndex) => {
                const originalTabPositionX = tabPositions[originalIndex]
                const draggabilly = new Draggabilly(tabEl, {
                    axis: 'x',
                    handle: '.tab-drag-handle',
                    containment: this.tabContentEl
                })

                this.draggabillies.push(draggabilly)

                draggabilly.on('pointerDown', () => {
                    window.container_manager.set_active_container(tabEl.getAttribute('data-id'))
                })

                draggabilly.on('dragStart', () => {
                    this.isDragging = true
                    this.draggabillyDragging = draggabilly
                    tabEl.classList.add('tab-is-dragging')
                    this.el.classList.add('tabs-is-sorting')
                })

                draggabilly.on('dragEnd', () => {
                    this.isDragging = false
                    const finalTranslateX = parseFloat(tabEl.style.left)
                    tabEl.style.transform = `translate3d(0, 0, 0)`

                    // Animate dragged tab back into its place
                    requestAnimationFrame(() => {
                        tabEl.style.left = '0'
                        tabEl.style.transform = `translate3d(${finalTranslateX}px, 0, 0)`

                        requestAnimationFrame(() => {
                            tabEl.classList.remove('tab-is-dragging')
                            this.el.classList.remove('tabs-is-sorting')

                            tabEl.classList.add('tab-was-just-dragged')

                            requestAnimationFrame(() => {
                                tabEl.style.transform = ''

                                this.layoutTabs()
                                this.setupDraggabilly()
                            })
                        })
                    })
                })

                draggabilly.on('dragMove', (event: Event, pointer: MouseEvent, moveVector: Position) => {
                    // Current index be computed within the event since it can change during the dragMove
                    const tabEls = this.tabEls
                    const currentIndex = tabEls.indexOf(tabEl)

                    const currentTabPositionX = originalTabPositionX + moveVector.x
                    const destinationIndexTarget = closest(currentTabPositionX, tabPositions)
                    const destinationIndex = Math.max(0, Math.min(tabEls.length, destinationIndexTarget))

                    if (currentIndex !== destinationIndex) {
                        this.animateTabMove(tabEl, currentIndex, destinationIndex)
                    }
                })
            })
        }

        private animateTabMove(tabEl: HTMLDivElement, originIndex: number, destinationIndex: number) {
            if (destinationIndex < originIndex) {
                if (tabEl.parentNode)
                    tabEl.parentNode.insertBefore(tabEl, this.tabEls[destinationIndex])
            } else {
                if (tabEl.parentNode)
                    tabEl.parentNode.insertBefore(tabEl, this.tabEls[destinationIndex + 1])
            }
            //Tell Python to reorder its containers.
            window.api.reorder_containers(originIndex, destinationIndex)
            this.layoutTabs()
        }
    }()
}

//Following Size Constants Control when elements of the tab-content disappear
const TAB_SIZE_MINI = 28
const TAB_SIZE_SMALL = 110
const TAB_SIZE_SMALLER = 54
//Tab Sizing Constants
const TAB_CONTENT_MARGIN = 9
const TAB_CONTENT_OVERLAP_DISTANCE = 1
const TAB_CONTENT_MIN_WIDTH = 24
const TAB_CONTENT_MAX_WIDTH = 180

interface Position {
    x: number;
    y: number;
}

function closest(value: number, array: number[]): number {
    let closest = Infinity
    let closestIndex = -1

    array.forEach((v: number, i: number) => {
        if (Math.abs(value - v) < closest) {
            closest = Math.abs(value - v)
            closestIndex = i
        }
    })

    return closestIndex
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
`