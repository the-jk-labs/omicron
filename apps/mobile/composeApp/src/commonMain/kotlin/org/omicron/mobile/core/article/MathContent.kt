package org.omicron.mobile.core.article

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.em
import com.fleeksoft.ksoup.nodes.Element
import com.fleeksoft.ksoup.nodes.Node
import com.fleeksoft.ksoup.nodes.TextNode

data class MathContent(
    val text: AnnotatedString,
    val sourceFallback: Boolean,
)

fun MathContent.styled(): AnnotatedString =
    buildAnnotatedString {
        val family = if (sourceFallback) FontFamily.Monospace else FontFamily.Serif
        withStyle(SpanStyle(fontFamily = family)) { append(text) }
    }

fun Element.mathContent(): MathContent {
    val linearized = buildAnnotatedString { appendMathChildrenOf(this@mathContent) }
    if (linearized.text.isNotBlank()) return MathContent(linearized, sourceFallback = false)
    val source = selectFirst("annotation")?.text()?.trim().orEmpty()
    return MathContent(AnnotatedString(source), sourceFallback = true)
}

private fun AnnotatedString.Builder.appendMathChildrenOf(element: Element) {
    element.childNodes().forEach { appendMathNode(it) }
}

private fun AnnotatedString.Builder.appendMathElement(element: Element?) {
    element?.childNodes()?.forEach { appendMathNode(it) }
}

private fun AnnotatedString.Builder.appendMathNode(node: Node) {
    if (node is TextNode) {
        if (node.text().isNotBlank()) append(node.text())
        return
    }
    if (node !is Element) return
    when (node.tagName()) {
        "mi" -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { appendMathChildrenOf(node) }
        "msup" -> appendScripts(node, listOf(null, scriptStyle(BaselineShift.Superscript)))
        "msub" -> appendScripts(node, listOf(null, scriptStyle(BaselineShift.Subscript)))
        "msubsup" -> appendScripts(node, listOf(null, scriptStyle(BaselineShift.Subscript), scriptStyle(BaselineShift.Superscript)))
        "munder" -> appendScripts(node, listOf(null, scriptStyle(BaselineShift.Subscript)))
        "mover" -> appendScripts(node, listOf(null, scriptStyle(BaselineShift.Superscript)))
        "munderover" -> appendScripts(node, listOf(null, scriptStyle(BaselineShift.Subscript), scriptStyle(BaselineShift.Superscript)))
        "mfrac" -> {
            val parts = node.children()
            appendMathElement(parts.getOrNull(0))
            append("⁄")
            appendMathElement(parts.getOrNull(1))
        }
        "msqrt" -> {
            append("√(")
            appendMathChildrenOf(node)
            append(")")
        }
        "mroot" -> {
            val parts = node.children()
            if (parts.size > 1) withStyle(scriptStyle(BaselineShift.Superscript)) { appendMathElement(parts[1]) }
            append("√(")
            appendMathElement(parts.getOrNull(0))
            append(")")
        }
        "mtable" -> {
            append("[")
            node.children().forEachIndexed { rowIndex, row ->
                if (rowIndex > 0) append("; ")
                row.children().forEachIndexed { cellIndex, cell ->
                    if (cellIndex > 0) append(", ")
                    appendMathElement(cell)
                }
            }
            append("]")
        }
        "mspace" -> append(" ")
        "mo" -> appendOperator(node)
        "annotation", "mphantom" -> Unit
        else -> appendMathChildrenOf(node)
    }
}

private fun AnnotatedString.Builder.appendScripts(
    element: Element,
    shifts: List<SpanStyle?>,
) {
    var slot = 0
    element.childNodes().forEach { child ->
        if (child is TextNode && child.text().isBlank()) return@forEach
        val style = shifts.getOrNull(slot)
        if (style == null) appendMathNode(child) else withStyle(style) { appendMathNode(child) }
        slot++
    }
}

private fun AnnotatedString.Builder.appendOperator(element: Element) {
    val text = element.text()
    if (text.isEmpty()) return
    if (element.hasAttr("fence") || (text.length == 1 && text[0] in TIGHT_OPERATORS)) {
        append(text)
    } else {
        append(" ")
        append(text)
        append(" ")
    }
}

private fun scriptStyle(shift: BaselineShift) = SpanStyle(baselineShift = shift, fontSize = 0.75.em)

private val TIGHT_OPERATORS = setOf('(', ')', '[', ']', '{', '}', '|', ',', '.', ';', ':', '!', '?', '\'', '"', '/')
