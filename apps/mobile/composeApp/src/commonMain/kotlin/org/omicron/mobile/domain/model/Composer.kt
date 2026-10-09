package org.omicron.mobile.domain.model

import com.fleeksoft.ksoup.Ksoup
import com.fleeksoft.ksoup.nodes.Element
import com.fleeksoft.ksoup.nodes.Node
import com.fleeksoft.ksoup.nodes.TextNode

sealed interface ComposerBlock {
    val id: String

    data class Paragraph(
        override val id: String,
        val text: String = "",
    ) : ComposerBlock

    data class Heading(
        override val id: String,
        val level: Int,
        val text: String = "",
    ) : ComposerBlock

    data class Quote(
        override val id: String,
        val text: String = "",
    ) : ComposerBlock

    data class Code(
        override val id: String,
        val text: String = "",
        val language: String? = null,
    ) : ComposerBlock

    data class BulletList(
        override val id: String,
        val items: List<String> = emptyList(),
    ) : ComposerBlock

    data class OrderedList(
        override val id: String,
        val items: List<String> = emptyList(),
    ) : ComposerBlock

    data class Image(
        override val id: String,
        val url: String = "",
        val alt: String? = null,
    ) : ComposerBlock

    data class Divider(
        override val id: String,
    ) : ComposerBlock

    data class RawHtml(
        override val id: String,
        val html: String,
    ) : ComposerBlock
}

fun List<ComposerBlock>.toHtml(): String =
    buildString {
        this@toHtml.forEach { block ->
            when (block) {
                is ComposerBlock.Paragraph -> {
                    if (block.text.isNotBlank()) append("<p>${block.text.toBodyHtml()}</p>")
                }
                is ComposerBlock.Heading -> {
                    if (block.text.isNotBlank()) append("<h${block.level.coerceIn(1, 6)}>${block.text.toBodyHtml()}</h${block.level.coerceIn(1, 6)}>")
                }
                is ComposerBlock.Quote -> {
                    if (block.text.isNotBlank()) append("<blockquote>${block.text.toBodyHtml()}</blockquote>")
                }
                is ComposerBlock.Code -> {
                    if (block.text.isNotBlank()) {
                        val open = block.language?.let { "<pre><code class=\"language-${it.escapeAttr()}\">" } ?: "<pre><code>"
                        append("$open${block.text.escapeHtml()}</code></pre>")
                    }
                }
                is ComposerBlock.BulletList -> {
                    val items = block.items.filter { it.isNotBlank() }
                    if (items.isNotEmpty()) {
                        append("<ul>")
                        items.forEach { append("<li>${it.toBodyHtml()}</li>") }
                        append("</ul>")
                    }
                }
                is ComposerBlock.OrderedList -> {
                    val items = block.items.filter { it.isNotBlank() }
                    if (items.isNotEmpty()) {
                        append("<ol>")
                        items.forEach { append("<li>${it.toBodyHtml()}</li>") }
                        append("</ol>")
                    }
                }
                is ComposerBlock.Image -> {
                    if (block.url.isNotBlank()) {
                        val alt = block.alt?.let { " alt=\"${it.escapeAttr()}\"" } ?: ""
                        append("<img src=\"${block.url.escapeAttr()}\"$alt>")
                    }
                }
                is ComposerBlock.Divider -> append("<hr>")
                is ComposerBlock.RawHtml -> {
                    if (block.html.isNotBlank()) append(block.html)
                }
            }
        }
    }

fun List<ComposerBlock>.hasContent(): Boolean =
    any { block ->
        when (block) {
            is ComposerBlock.Paragraph -> block.text.isNotBlank()
            is ComposerBlock.Heading -> block.text.isNotBlank()
            is ComposerBlock.Quote -> block.text.isNotBlank()
            is ComposerBlock.Code -> block.text.isNotBlank()
            is ComposerBlock.BulletList -> block.items.any { it.isNotBlank() }
            is ComposerBlock.OrderedList -> block.items.any { it.isNotBlank() }
            is ComposerBlock.Image -> block.url.isNotBlank()
            is ComposerBlock.Divider -> false
            is ComposerBlock.RawHtml -> block.html.isNotBlank()
        }
    }

fun parseComposerHtml(html: String): List<ComposerBlock> {
    if (html.isBlank()) return emptyList()
    var nextId = 0
    return Ksoup.parse(html).body().childNodes().flatMap { node ->
        parseComposerNode(node)?.let { block ->
            nextId += 1
            listOf(block.withId("imported-$nextId"))
        } ?: emptyList()
    }
}

private fun ComposerBlock.withId(id: String): ComposerBlock =
    when (this) {
        is ComposerBlock.Paragraph -> copy(id = id)
        is ComposerBlock.Heading -> copy(id = id)
        is ComposerBlock.Quote -> copy(id = id)
        is ComposerBlock.Code -> copy(id = id)
        is ComposerBlock.BulletList -> copy(id = id)
        is ComposerBlock.OrderedList -> copy(id = id)
        is ComposerBlock.Image -> copy(id = id)
        is ComposerBlock.Divider -> copy(id = id)
        is ComposerBlock.RawHtml -> copy(id = id)
    }

private fun parseComposerNode(node: Node): ComposerBlock? {
    if (node is TextNode) {
        val text = node.text().trim()
        return if (text.isEmpty()) null else ComposerBlock.Paragraph(id = "", text = text)
    }
    if (node !is Element) return null
    return when (node.tagName()) {
        "h1", "h2", "h3", "h4", "h5", "h6" -> {
            val text = node.plainText()
            if (text != null && text.isNotBlank()) {
                ComposerBlock.Heading(id = "", level = node.tagName()[1].digitToInt(), text = text.trim())
            } else {
                ComposerBlock.RawHtml(id = "", html = node.outerHtml())
            }
        }
        "p", "div" -> {
            val text = node.plainText()
            if (text != null) {
                if (text.isBlank()) null else ComposerBlock.Paragraph(id = "", text = text.trim())
            } else {
                ComposerBlock.RawHtml(id = "", html = node.outerHtml())
            }
        }
        "blockquote" -> {
            val text = node.plainText()
            if (text != null) {
                if (text.isBlank()) null else ComposerBlock.Quote(id = "", text = text.trim())
            } else {
                ComposerBlock.RawHtml(id = "", html = node.outerHtml())
            }
        }
        "pre" -> {
            val text = node.wholeText().trim('\n')
            if (text.isBlank()) null else ComposerBlock.Code(id = "", text = text, language = node.codeLanguage())
        }
        "ul", "ol" -> {
            val items = node.children().filter { it.tagName() == "li" }
            if (items.isEmpty()) {
                null
            } else {
                val texts = items.map { it.plainText() }
                if (texts.any { it == null }) {
                    ComposerBlock.RawHtml(id = "", html = node.outerHtml())
                } else {
                    val clean = texts.filterNotNull().map { it.trim() }.filter { it.isNotBlank() }
                    if (clean.isEmpty()) {
                        null
                    } else if (node.tagName() == "ul") {
                        ComposerBlock.BulletList(id = "", items = clean)
                    } else {
                        ComposerBlock.OrderedList(id = "", items = clean)
                    }
                }
            }
        }
        "li" -> {
            val text = node.plainText()
            if (text != null && text.isNotBlank()) {
                ComposerBlock.BulletList(id = "", items = listOf(text.trim()))
            } else {
                ComposerBlock.RawHtml(id = "", html = node.outerHtml())
            }
        }
        "img" -> {
            val src = node.attr("src")
            if (src.isBlank()) null else ComposerBlock.Image(id = "", url = src, alt = node.attr("alt").ifBlank { null })
        }
        "hr" -> ComposerBlock.Divider(id = "")
        else -> ComposerBlock.RawHtml(id = "", html = node.outerHtml())
    }
}

private fun Element.plainText(): String? {
    val result = StringBuilder()
    childNodes().forEach { child ->
        when (child) {
            is TextNode -> result.append(child.text())
            is Element -> if (child.tagName() == "br") result.append('\n') else return null
            else -> return null
        }
    }
    return result.toString()
}

private fun Element.codeLanguage(): String? =
    selectFirst("code")
        ?.classNames()
        ?.firstOrNull { it.startsWith("language-") }
        ?.removePrefix("language-")

private fun String.toBodyHtml(): String = escapeHtml().replace("\n", "<br>")

private fun String.escapeHtml(): String =
    replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")

private fun String.escapeAttr(): String = escapeHtml()
