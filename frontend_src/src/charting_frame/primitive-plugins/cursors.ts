
/**
 * Currently these functions only set the cursor of the charting div since that is
 * accessible through css relatively easily. Ideally this functionality would be
 * expanded to loop through all of the charts created and show/hide the crosshairs
 * extensions that are drawn on the HTML5 Canvas by lightweight-charts.
 */

const tv_chart_css_rule = (() => {
    for (const sheet of Array.from(document.styleSheets))
        if (sheet.href !== null && sheet.href.endsWith('.css'))
            for (const rule of Array.from(sheet.cssRules))
                //@ts-ignore
                if (rule.selectorText === '.tv-lightweight-charts')
                    return rule
})()

export function setCrosshair(){
    if (!tv_chart_css_rule) return
    (tv_chart_css_rule as CSSStyleRule).style.cursor = 'crosshair'
}

export function setArrow(){
    if (!tv_chart_css_rule) return
    (tv_chart_css_rule as CSSStyleRule).style.cursor = ''
}

const cursor_dot = `url('data:image/svg+xml,<svg width="12px" height="12px" style="fill:white" viewBox="-4 -4 8.00 8.00" xmlns="http://www.w3.org/2000/svg"><path d="M -2.2 0 C -2.201.711 -0.37 2.769 1.097 1.922 C 1.777 1.529 2.197 0.803 2.197 0.017 C 2.197 -1.677 0.363 -2.735 -1.103 -1.888 C -1.784 -1.495 -2.203 -0.769 -2.203 0.017 Z"/></svg>') 6 6, auto`
export function setDot(){
    if (!tv_chart_css_rule) return
    (tv_chart_css_rule as CSSStyleRule).style.cursor = cursor_dot
}
