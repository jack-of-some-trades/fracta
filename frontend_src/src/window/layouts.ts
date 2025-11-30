/**
 * This file defines all the necessary variables and functions to create a display
 * that has a selectable layout with customizable frame sizes. 
 * 
 * Call Layout switch with the desired layout and store the returned flex_frame array.
 * 
 * Upon a resize event call resize_frames with the dimensions of the enclosing Div Element
 * The flex_frame[] is updated in place. Apply the style element in each flex_frame to it's 
 * respective div.
 */

import { Accessor } from "solid-js"

const HALF_WIDTH = 4
const RESIZE_HANDLE_WIDTH = 8

/**
 * Interface to set the border size and minimum frame size of a layout. To set the separation between
 * frames use CSS. Make each div's box sizing a border-box and adjust the separation by setting the div's
 * border size.
 * 
 * @MIN_FRAME_WIDTH : [0, 1] Represents the minimum fraction of a window's width a single frame can be.
 * @MIN_FRAME_HEIGHT : [0, 1] Represents the minimum fraction of a window's Height a single frame can be.
 */
interface layout_constants {
    MIN_FRAME_WIDTH: number
    MIN_FRAME_HEIGHT: number
}

const default_layout_constants: layout_constants = {
    MIN_FRAME_WIDTH: 0.15,
    MIN_FRAME_HEIGHT: 0.1,
}

export enum Orientation {
    Horizontal,
    Vertical,
    null
}

interface rect {
    top: number,
    left: number,
    width: number,
    height: number
}

export interface flex_frame {
    rect: rect,
    style: string,
    flex_width: number,
    flex_height: number,
    resize_pos: flex_frame[],
    resize_neg: flex_frame[],
    orientation: Orientation,
    mouseDown: (e: MouseEvent) => void
}

export enum Container_Layouts {
    SINGLE,
    DOUBLE_VERT,
    DOUBLE_HORIZ,
    TRIPLE_VERT,
    TRIPLE_VERT_LEFT,
    TRIPLE_VERT_RIGHT,
    TRIPLE_HORIZ,
    TRIPLE_HORIZ_TOP,
    TRIPLE_HORIZ_BOTTOM,
    QUAD_SQ_V,
    QUAD_SQ_H,
    QUAD_VERT,
    QUAD_HORIZ,
    QUAD_LEFT,
    QUAD_RIGHT,
    QUAD_TOP,
    QUAD_BOTTOM
}

// Utility Function more than anything else
export function num_frames(layout: Container_Layouts | undefined): number {
    switch (layout) {
        case (Container_Layouts.SINGLE): return 1
        case (Container_Layouts.DOUBLE_VERT): return 2
        case (Container_Layouts.DOUBLE_HORIZ): return 2
        case (Container_Layouts.TRIPLE_VERT): return 3
        case (Container_Layouts.TRIPLE_VERT_LEFT): return 3
        case (Container_Layouts.TRIPLE_VERT_RIGHT): return 3
        case (Container_Layouts.TRIPLE_HORIZ): return 3
        case (Container_Layouts.TRIPLE_HORIZ_TOP): return 3
        case (Container_Layouts.TRIPLE_HORIZ_BOTTOM): return 3
        case (Container_Layouts.QUAD_SQ_V): return 4
        case (Container_Layouts.QUAD_SQ_H): return 4
        case (Container_Layouts.QUAD_VERT): return 4
        case (Container_Layouts.QUAD_HORIZ): return 4
        case (Container_Layouts.QUAD_LEFT): return 4
        case (Container_Layouts.QUAD_RIGHT): return 4
        case (Container_Layouts.QUAD_TOP): return 4
        case (Container_Layouts.QUAD_BOTTOM): return 4
        default: return 0
    }
}

//#endregion


//#region ----------------------- Resize Functions ----------------------- //


/**
 * Creates a flex_frame for a Widget. Widget Created Seprately
 */
function widget_section(flex_width: number, flex_height: number): flex_frame {
    let new_section: flex_frame = {
        rect: { top: 0, left: 0, width: 0, height: 0 },
        style: '',
        mouseDown: () => { },
        flex_width: flex_width,
        flex_height: flex_height,
        orientation: Orientation.null,
        resize_pos: [],
        resize_neg: [],
    }
    return new_section
}

/**
 * Creates a flex_frame for use as a separator between frame elements
 */
function separator_section(
    type: Orientation,
    size: number,
    divRect: Accessor<DOMRect>,
    resize: () => void,
    layout_params: layout_constants,
): flex_frame {
    let new_section: flex_frame = {
        rect: { top: 0, left: 0, width: 0, height: 0 },
        style: '',
        mouseDown: () => { },
        flex_height: (type === Orientation.Vertical ? size : 0),
        flex_width: (type === Orientation.Horizontal ? size : 0),
        orientation: type,
        resize_pos: [],
        resize_neg: [],
    }

    //Bind Resize Args
    let resize_partial_func;
    if (type === Orientation.Vertical)
        //A vertically oriented separator resizes in the horizontal direction and vise-vera
        resize_partial_func = resize_flex_horizontal.bind(
            undefined, layout_params.MIN_FRAME_WIDTH, divRect, resize, new_section
        )
    else
        resize_partial_func = resize_flex_vertical.bind(
            undefined, layout_params.MIN_FRAME_HEIGHT, divRect, resize, new_section
        )

    const mouseup = () => {
        document.removeEventListener('mousemove', resize_partial_func)
        document.removeEventListener('mouseup', mouseup)
    }

    //Should be Added to the element when mounted
    new_section.mouseDown = () => {
        document.addEventListener('mousemove', resize_partial_func)
        document.addEventListener('mouseup', mouseup)
    }

    return new_section
}

/**
 * Resize the Flex Width %s of all neighboring frames & separators 
 * This only changes the %. The call to resize it what resizes everything
 */
function resize_flex_horizontal(
    MIN_SIZE: number,
    divRect: Accessor<DOMRect>,
    resize: () => void,
    separator: flex_frame,
    e: MouseEvent
) {
    //flex total is the total percentage of the screen that the left & Right frames occupy
    //e.g a Triple_vertical will have an initial flex_total of 0.33 + 0.33 = 0.66
    let flex_total = separator.resize_pos[0].flex_width + separator.resize_neg[0].flex_width
    let width_total = separator.resize_pos[0].rect.width + separator.resize_neg[0].rect.width
    //By definition resize_pos[0] and resize_neg[0] will always be valid

    //x position relative to the left most fixed boundary (fixed compared to the elements being resized)
    let relative_x = e.clientX - (divRect().left + (separator.resize_pos[0]?.rect.left ?? 0))
    let flex_size_left = (relative_x / width_total) * flex_total
    let flex_size_right = flex_total - flex_size_left

    //Limit the size of each frame to the minimum.
    if (flex_size_left < MIN_SIZE) {
        flex_size_left = MIN_SIZE
        flex_size_right = flex_total - flex_size_left
    } else if (flex_size_right < MIN_SIZE) {
        flex_size_right = MIN_SIZE
        flex_size_left = flex_total - flex_size_right
    }

    separator.resize_pos.forEach(section => {
        section.flex_width = flex_size_left
    });
    separator.resize_neg.forEach(section => {
        section.flex_width = flex_size_right
    });

    resize()
}

/**
 * Resize the Flex Height %s of all neighboring frames & separators 
 * This only changes the %. The call to resize it what resizes everything
 */
function resize_flex_vertical(
    MIN_SIZE: number,
    divRect: Accessor<DOMRect>,
    resize: () => void,
    separator: flex_frame,
    e: MouseEvent
) {
    let flex_total = separator.resize_pos[0].flex_height + separator.resize_neg[0].flex_height
    let height_total = separator.resize_pos[0].rect.height + separator.resize_neg[0].rect.height

    let container_y = e.clientY - (divRect().top + (separator.resize_pos[0]?.rect.top ?? 0))
    let flex_size_top = (container_y / height_total) * flex_total
    let flex_size_bottom = flex_total - flex_size_top

    //Limit the size of each frame to the minimum.
    if (flex_size_top < MIN_SIZE) {
        flex_size_top = MIN_SIZE
        flex_size_bottom = flex_total - flex_size_top
    } else if (flex_size_bottom < MIN_SIZE) {
        flex_size_bottom = MIN_SIZE
        flex_size_top = flex_total - flex_size_bottom
    }

    separator.resize_pos.forEach(section => {
        section.flex_height = flex_size_top
    });
    separator.resize_neg.forEach(section => {
        section.flex_height = flex_size_bottom
    });

    resize()
}

/**
 * Resize all the flex_frame sections based on the given total container dimensions
 * 
 */
export function resize_sections(divRect: Accessor<DOMRect>, frames: flex_frame[]) {
    let width = divRect().width
    let height = divRect().height
    if (width <= 0 || height <= 0) return

    //Resize Frame & Separator sections Based soley on flex size
    frames.forEach((section, i) => {
        let new_rect: rect, top, left;
        if (section.orientation === Orientation.Vertical) {             //Vertical Separators 
            let ref_rect = section.resize_pos[0]?.rect
            top = ref_rect?.top
            left = ref_rect?.left + ref_rect?.width
            new_rect = {
                top: top ?? 0,
                left: left ?? 0,
                width: RESIZE_HANDLE_WIDTH,
                height: Math.round(height * section.flex_height),
            }
            frames[i].style =
                `{top:${new_rect.top}px; left:${new_rect.left - HALF_WIDTH}px; width:${new_rect.width}px; height:${new_rect.height}px}`

        } else if (section.orientation === Orientation.Horizontal) {    //Horizontal Separators
            let ref_rect = section.resize_pos[0]?.rect
            top = ref_rect?.top + ref_rect?.height
            left = ref_rect?.left
            new_rect = {
                top: top ?? 0,
                left: left ?? 0,
                width: Math.round(width * section.flex_width),
                height: RESIZE_HANDLE_WIDTH,
            }
            frames[i].style =
                `{top:${new_rect.top - HALF_WIDTH}px; left:${new_rect.left}px; width:${new_rect.width}px; height:${new_rect.height}px}`


        } else {                                                        //Frame Widget
            if (section.resize_pos[0]?.orientation === Orientation.Horizontal) {
                top = section.resize_pos[0]?.rect.top
                left = section.resize_pos[1]?.rect.left
            } else {
                top = section.resize_pos[1]?.rect.top
                left = section.resize_pos[0]?.rect.left
            }

            new_rect = {
                top: top ?? 0,
                left: left ?? 0,
                width: Math.round(width * section.flex_width),
                height: Math.round(height * section.flex_height),
            }
            frames[i].style =
                `{top:${new_rect.top}px; left:${new_rect.left}px; width:${new_rect.width}px; height:${new_rect.height}px}`
        }
        //Commit the new sizing to the object, Style is used by the display, rect is used by other sizing
        frames[i].rect = new_rect

    })
}

/**
 * Giant Switch Statement that creates each of the individual layouts. The order and
 * connections made define the behavior of the layout. I've left comments in the first
 * case to try and explain how things are connected so additional layouts can be derived
 * 
 * @param divRect: The Div that will contain the entire layout. It's bounding DOMRect is used to
 *        ensure seamless resizing of individual frames
 * @param resize: Bound resize function. After an individual frame is resized this function is invoked
 *        so the new calculated Frame sizes can be used to style their respective elements  
 * @param layout_params: Optional argument that sets the Minimum Frame Size
 */
export function layout_switch(
    layout: Container_Layouts,
    divRect: Accessor<DOMRect>,
    resize: () => void,
    layout_params: layout_constants = default_layout_constants,
): flex_frame[] {

    switch (layout) {
        case Container_Layouts.DOUBLE_VERT: {
            let f1 = widget_section(0.5, 1)
            let s1 = separator_section(Orientation.Vertical, 1, divRect, resize, layout_params)
            let f2 = widget_section(0.5, 1)

            // For Separators, resize_pos/neg hold frames. 
            // pos frames grow proportionally with the separator movement, neg frames grow inversely
            // E.g. As S1 Moves Right/Down (increases in px location) f1 will grow in width, f2 will shrink.
            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2)

            // For Frames, resize_pos hold separators. At most one Horizontal and one Vertical.
            // If the Separator is Vertical, The 'left' position (in px) of the Frame === 'left' position
            // of the the Separator. (The width of the separator is adjusted for so adjacent frames are touching)
            // If the Separator is Horizontal, the 'top' position is transferred to the Frame's position.

            // If this array is empty, or a Veritcal/Horizontal Separator is missing, the relevant positon,
            // top or left, is set to 0px (relative to the div containing the layout.)
            f2.resize_pos.push(s1)
            // Frames do not hold anything in their resize_neg array.

            // Display locations are updated in the order of the list below. 
            // f1 has no dependents => first, 
            // s1.left depends on f1.width => Second, 
            // f2.left depends on s1.left => last
            return [f1, s1, f2]
        }

        case Container_Layouts.DOUBLE_HORIZ: {
            let f1 = widget_section(1, 0.5)
            let s1 = separator_section(Orientation.Horizontal, 1, divRect, resize, layout_params)
            let f2 = widget_section(1, 0.5)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2)

            f2.resize_pos.push(s1)

            return [f1, s1, f2]
        }

        case Container_Layouts.TRIPLE_VERT: {
            let f1 = widget_section(0.333, 1)
            let s1 = separator_section(Orientation.Vertical, 1, divRect, resize, layout_params)
            let f2 = widget_section(0.333, 1)
            let s2 = separator_section(Orientation.Vertical, 1, divRect, resize, layout_params)
            let f3 = widget_section(0.333, 1)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2)
            s2.resize_pos.push(f2)
            s2.resize_neg.push(f3)


            f2.resize_pos.push(s1)
            f3.resize_pos.push(s2)

            return [f1, s1, f2, s2, f3]
        }

        case Container_Layouts.TRIPLE_VERT_LEFT: {
            let f1 = widget_section(0.5, 1)
            let s1 = separator_section(Orientation.Vertical, 1, divRect, resize, layout_params)
            let f2 = widget_section(0.5, 0.5)
            let s2 = separator_section(Orientation.Horizontal, 0.5, divRect, resize, layout_params)
            let f3 = widget_section(0.5, 0.5)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2, f3, s2)
            s2.resize_pos.push(f2)
            s2.resize_neg.push(f3)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s1, s2)

            return [f1, s1, f2, s2, f3]
        }

        case Container_Layouts.TRIPLE_VERT_RIGHT: {
            let f1 = widget_section(0.5, 0.5)
            let s1 = separator_section(Orientation.Horizontal, 0.5, divRect, resize, layout_params)
            let f2 = widget_section(0.5, 0.5)
            let s2 = separator_section(Orientation.Vertical, 1, divRect, resize, layout_params)
            let f3 = widget_section(0.5, 1)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2)
            s2.resize_pos.push(f1, f2, s1)
            s2.resize_neg.push(f3)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s2)

            return [f1, s1, f2, s2, f3]
        }

        case Container_Layouts.TRIPLE_HORIZ: {
            let f1 = widget_section(1, 0.333)
            let s1 = separator_section(Orientation.Horizontal, 1, divRect, resize, layout_params)
            let f2 = widget_section(1, 0.333)
            let s2 = separator_section(Orientation.Horizontal, 1, divRect, resize, layout_params)
            let f3 = widget_section(1, 0.333)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2)
            s2.resize_pos.push(f2)
            s2.resize_neg.push(f3)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s2)

            return [f1, s1, f2, s2, f3]
        }

        case Container_Layouts.TRIPLE_HORIZ_TOP: {
            let f1 = widget_section(1, 0.5)
            let s1 = separator_section(Orientation.Horizontal, 1, divRect, resize, layout_params)
            let f2 = widget_section(0.5, 0.5)
            let s2 = separator_section(Orientation.Vertical, 0.5, divRect, resize, layout_params)
            let f3 = widget_section(0.5, 0.5)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2, f3, s2)
            s2.resize_pos.push(f2)
            s2.resize_neg.push(f3)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s1, s2)

            return [f1, s1, f2, s2, f3]
        }

        case Container_Layouts.TRIPLE_HORIZ_BOTTOM: {
            let f1 = widget_section(0.5, 0.5)
            let s1 = separator_section(Orientation.Vertical, 0.5, divRect, resize, layout_params)
            let f2 = widget_section(0.5, 0.5)
            let s2 = separator_section(Orientation.Horizontal, 1, divRect, resize, layout_params)
            let f3 = widget_section(1, 0.5)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2)
            s2.resize_pos.push(f1, f2, s1)
            s2.resize_neg.push(f3)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s2)

            return [f1, s1, f2, s2, f3]
        }

        case Container_Layouts.QUAD_SQ_H: {
            let f1 = widget_section(0.5, 0.5)
            let s1 = separator_section(Orientation.Vertical, 0.5, divRect, resize, layout_params)
            let f2 = widget_section(0.5, 0.5)
            let s2 = separator_section(Orientation.Horizontal, 1, divRect, resize, layout_params)
            let f3 = widget_section(0.5, 0.5)
            let s3 = separator_section(Orientation.Vertical, 0.5, divRect, resize, layout_params)
            let f4 = widget_section(0.5, 0.5)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2)
            s3.resize_pos.push(f3)
            s3.resize_neg.push(f4)
            s2.resize_pos.push(f1, f2, s1)
            s2.resize_neg.push(f3, f4, s3)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s2)
            f4.resize_pos.push(s2, s3)

            return [f1, s1, f2, s2, f3, s3, f4]
        }

        case Container_Layouts.QUAD_SQ_V: {
            let f1 = widget_section(0.5, 0.5)
            let s1 = separator_section(Orientation.Horizontal, 0.5, divRect, resize, layout_params)
            let f2 = widget_section(0.5, 0.5)
            let s2 = separator_section(Orientation.Vertical, 1, divRect, resize, layout_params)
            let f3 = widget_section(0.5, 0.5)
            let s3 = separator_section(Orientation.Horizontal, 0.5, divRect, resize, layout_params)
            let f4 = widget_section(0.5, 0.5)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2)
            s3.resize_pos.push(f3)
            s3.resize_neg.push(f4)
            s2.resize_pos.push(f1, f2, s1)
            s2.resize_neg.push(f3, f4, s3)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s2)
            f4.resize_pos.push(s2, s3)

            return [f1, s1, f2, s2, f3, s3, f4]
        }

        case Container_Layouts.QUAD_VERT: {
            let f1 = widget_section(0.25, 1)
            let s1 = separator_section(Orientation.Vertical, 1, divRect, resize, layout_params)
            let f2 = widget_section(0.25, 1)
            let s2 = separator_section(Orientation.Vertical, 1, divRect, resize, layout_params)
            let f3 = widget_section(0.25, 1)
            let s3 = separator_section(Orientation.Vertical, 1, divRect, resize, layout_params)
            let f4 = widget_section(0.25, 1)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2)
            s2.resize_pos.push(f2)
            s2.resize_neg.push(f3)
            s3.resize_pos.push(f3)
            s3.resize_neg.push(f4)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s2)
            f4.resize_pos.push(s3)

            return [f1, s1, f2, s2, f3, s3, f4]
        }

        case Container_Layouts.QUAD_HORIZ: {
            let f1 = widget_section(1, 0.25)
            let s1 = separator_section(Orientation.Horizontal, 1, divRect, resize, layout_params)
            let f2 = widget_section(1, 0.25)
            let s2 = separator_section(Orientation.Horizontal, 1, divRect, resize, layout_params)
            let f3 = widget_section(1, 0.25)
            let s3 = separator_section(Orientation.Horizontal, 1, divRect, resize, layout_params)
            let f4 = widget_section(1, 0.25)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2)
            s2.resize_pos.push(f2)
            s2.resize_neg.push(f3)
            s3.resize_pos.push(f3)
            s3.resize_neg.push(f4)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s2)
            f4.resize_pos.push(s3)

            return [f1, s1, f2, s2, f3, s3, f4]
        }

        case Container_Layouts.QUAD_LEFT: {
            let f1 = widget_section(0.5, 1)
            let s1 = separator_section(Orientation.Vertical, 1, divRect, resize, layout_params)
            let f2 = widget_section(0.5, 0.333)
            let s2 = separator_section(Orientation.Horizontal, 0.5, divRect, resize, layout_params)
            let f3 = widget_section(0.5, 0.333)
            let s3 = separator_section(Orientation.Horizontal, 0.5, divRect, resize, layout_params)
            let f4 = widget_section(0.5, 0.333)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2, f3, f4, s2, s3)
            s2.resize_pos.push(f2)
            s2.resize_neg.push(f3)
            s3.resize_pos.push(f3)
            s3.resize_neg.push(f4)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s1, s2)
            f4.resize_pos.push(s1, s3)

            return [f1, s1, f2, s2, f3, s3, f4]
        }

        case Container_Layouts.QUAD_RIGHT: {
            let f1 = widget_section(0.5, 0.333)
            let s1 = separator_section(Orientation.Horizontal, 0.5, divRect, resize, layout_params)
            let f2 = widget_section(0.5, 0.333)
            let s2 = separator_section(Orientation.Horizontal, 0.5, divRect, resize, layout_params)
            let f3 = widget_section(0.5, 0.333)
            let s3 = separator_section(Orientation.Vertical, 1, divRect, resize, layout_params)
            let f4 = widget_section(0.5, 1)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2)
            s2.resize_pos.push(f2)
            s2.resize_neg.push(f3)
            s3.resize_pos.push(f1, f2, f3, s1, s2)
            s3.resize_neg.push(f4)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s2)
            f4.resize_pos.push(s3)

            return [f1, s1, f2, s2, f3, s3, f4]
        }

        case Container_Layouts.QUAD_TOP: {
            let f1 = widget_section(1, 0.5)
            let s1 = separator_section(Orientation.Horizontal, 1, divRect, resize, layout_params)
            let f2 = widget_section(0.333, 0.5)
            let s2 = separator_section(Orientation.Vertical, 0.5, divRect, resize, layout_params)
            let f3 = widget_section(0.333, 0.5)
            let s3 = separator_section(Orientation.Vertical, 0.5, divRect, resize, layout_params)
            let f4 = widget_section(0.333, 0.5)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2, f3, f4, s2, s3)
            s2.resize_pos.push(f2)
            s2.resize_neg.push(f3)
            s3.resize_pos.push(f3)
            s3.resize_neg.push(f4)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s1, s2)
            f4.resize_pos.push(s1, s3)

            return [f1, s1, f2, s2, f3, s3, f4]
        }

        case Container_Layouts.QUAD_BOTTOM: {
            let f1 = widget_section(0.333, 0.5)
            let s1 = separator_section(Orientation.Vertical, 0.5, divRect, resize, layout_params)
            let f2 = widget_section(0.333, 0.5)
            let s2 = separator_section(Orientation.Vertical, 0.5, divRect, resize, layout_params)
            let f3 = widget_section(0.333, 0.5)
            let s3 = separator_section(Orientation.Horizontal, 1, divRect, resize, layout_params)
            let f4 = widget_section(1, 0.5)

            s1.resize_pos.push(f1)
            s1.resize_neg.push(f2)
            s2.resize_pos.push(f2)
            s2.resize_neg.push(f3)
            s3.resize_pos.push(f1, f2, f3, s1, s2)
            s3.resize_neg.push(f4)

            f2.resize_pos.push(s1)
            f3.resize_pos.push(s2)
            f4.resize_pos.push(s3)

            return [f1, s1, f2, s2, f3, s3, f4]
        }

        default:
            //Default Case is a single chart.
            return [widget_section(1, 1)]
    }
}