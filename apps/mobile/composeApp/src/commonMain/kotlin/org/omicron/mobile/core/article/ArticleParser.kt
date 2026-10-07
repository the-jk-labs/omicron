package org.omicron.mobile.core.article

import com.fleeksoft.ksoup.Ksoup
import com.fleeksoft.ksoup.nodes.Element
import com.fleeksoft.ksoup.nodes.Node
import com.fleeksoft.ksoup.nodes.TextNode

data class ArticleSpan(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val code: Boolean = false,
    val strikethrough: Boolean = false,
    val underline: Boolean = false,
    val link: String? = null,
)

typealias InlineContent = List<ArticleSpan>

sealed interface ArticleBlock {
    data class Heading(
        val level: Int,
        val content: InlineContent,
    ) : ArticleBlock

    data class Paragraph(
        val content: InlineContent,
    ) : ArticleBlock

    data class Quote(
        val blocks: List<ArticleBlock>,
    ) : ArticleBlock

    data class CodeBlock(
        val code: String,
        val language: String?,
    ) : ArticleBlock

    data class BulletList(
        val items: List<InlineContent>,
    ) : ArticleBlock

    data class OrderedList(
        val items: List<InlineContent>,
    ) : ArticleBlock

    data class Image(
        val url: String,
        val alt: String?,
    ) : ArticleBlock

    data class Table(
        val headers: List<InlineContent>,
        val rows: List<List<InlineContent>>,
    ) : ArticleBlock

    data object Divider : ArticleBlock

    data class PlainText(
        val text: String,
    ) : ArticleBlock
}

fun parseArticle(
    html: String,
    resolveUrl: (String) -> String = { it },
): List<ArticleBlock> {
    if (html.isBlank()) return emptyList()
    val body = Ksoup.parse(html).body()
    return body.childNodes().flatMap { parseBlock(it, resolveUrl) }
}

private fun parseBlock(
    node: Node,
    resolveUrl: (String) -> String,
): List<ArticleBlock> {
    if (node is TextNode) {
        val text = node.text().trim()
        return if (text.isEmpty()) emptyList() else listOf(ArticleBlock.Paragraph(listOf(ArticleSpan(text))))
    }
    if (node !is Element) return emptyList()
    return when (node.tagName()) {
        "h1", "h2", "h3", "h4", "h5", "h6" -> {
            val content = parseInline(node, Formatting(), resolveUrl)
            if (content.isEmpty()) emptyList() else listOf(ArticleBlock.Heading(node.tagName()[1].digitToInt(), content))
        }
        "p", "div" -> paragraphBlocks(node, resolveUrl)
        "blockquote" ->
            listOf(
                ArticleBlock.Quote(
                    node.childNodes().flatMap { parseBlock(it, resolveUrl) }.ifEmpty {
                        listOf(ArticleBlock.Paragraph(parseInline(node, Formatting(), resolveUrl)))
                    },
                ),
            )
        "pre" -> listOf(ArticleBlock.CodeBlock(node.wholeText().trim('\n'), node.codeLanguage()))
        "ul" -> {
            val items = node.children().filter { it.tagName() == "li" }.map { parseInline(it, Formatting(), resolveUrl) }
            if (items.isEmpty()) emptyList() else listOf(ArticleBlock.BulletList(items))
        }
        "ol" -> {
            val items = node.children().filter { it.tagName() == "li" }.map { parseInline(it, Formatting(), resolveUrl) }
            if (items.isEmpty()) emptyList() else listOf(ArticleBlock.OrderedList(items))
        }
        "li" -> paragraphBlocks(node, resolveUrl)
        "hr" -> listOf(ArticleBlock.Divider)
        "img" -> {
            val src = node.attr("src")
            if (src.isBlank()) emptyList() else listOf(ArticleBlock.Image(resolveUrl(src), node.attr("alt").ifBlank { null }))
        }
        "table" -> listOfNotNull(node.parseTable(resolveUrl))
        "br" -> listOf(ArticleBlock.Paragraph(listOf(ArticleSpan("\n"))))
        else -> {
            val children = node.childNodes().flatMap { parseBlock(it, resolveUrl) }
            if (children.isNotEmpty()) {
                children
            } else {
                val text = node.text().trim()
                if (text.isEmpty()) emptyList() else listOf(ArticleBlock.PlainText(text))
            }
        }
    }
}

private fun paragraphBlocks(
    element: Element,
    resolveUrl: (String) -> String,
): List<ArticleBlock> {
    val blocks = mutableListOf<ArticleBlock>()
    val content = parseInline(element, Formatting(), resolveUrl)
    if (content.any { it.text.isNotBlank() }) blocks += ArticleBlock.Paragraph(content)
    element.select("img").forEach { img ->
        val src = img.attr("src")
        if (src.isNotBlank()) blocks += ArticleBlock.Image(resolveUrl(src), img.attr("alt").ifBlank { null })
    }
    return blocks
}

private data class Formatting(
    val bold: Boolean = false,
    val italic: Boolean = false,
    val code: Boolean = false,
    val strikethrough: Boolean = false,
    val underline: Boolean = false,
    val link: String? = null,
)

private fun parseInline(
    node: Node,
    formatting: Formatting,
    resolveUrl: (String) -> String,
): InlineContent {
    if (node is TextNode) {
        val text = node.text()
        return if (text.isEmpty()) emptyList() else listOf(formatting.toSpan(text))
    }
    if (node !is Element) return emptyList()
    return when (node.tagName()) {
        "br" -> listOf(formatting.toSpan("\n"))
        "strong", "b" -> node.childNodes().flatMap { parseInline(it, formatting.copy(bold = true), resolveUrl) }
        "em", "i" -> node.childNodes().flatMap { parseInline(it, formatting.copy(italic = true), resolveUrl) }
        "code" -> node.childNodes().flatMap { parseInline(it, formatting.copy(code = true), resolveUrl) }
        "s", "del" -> node.childNodes().flatMap { parseInline(it, formatting.copy(strikethrough = true), resolveUrl) }
        "u", "ins" -> node.childNodes().flatMap { parseInline(it, formatting.copy(underline = true), resolveUrl) }
        "a" -> {
            val href = node.attr("href").ifBlank { null }?.let(resolveUrl)
            node.childNodes().flatMap { parseInline(it, formatting.copy(link = href), resolveUrl) }
        }
        "img" -> emptyList()
        else -> node.childNodes().flatMap { parseInline(it, formatting, resolveUrl) }
    }
}

private fun Formatting.toSpan(text: String) =
    ArticleSpan(
        text = text,
        bold = bold,
        italic = italic,
        code = code,
        strikethrough = strikethrough,
        underline = underline,
        link = link,
    )

private fun Element.codeLanguage(): String? =
    selectFirst("code")
        ?.classNames()
        ?.firstOrNull { it.startsWith("language-") }
        ?.removePrefix("language-")

private fun Element.parseTable(resolveUrl: (String) -> String): ArticleBlock.Table? {
    val rows = select("tr")
    if (rows.isEmpty()) return null
    val headerRow = rows.firstOrNull { row -> row.children().any { it.tagName() == "th" } }
    val headers = headerRow?.children()?.map { parseInline(it, Formatting(), resolveUrl) } ?: emptyList()
    val bodyRows =
        rows
            .filter { it != headerRow }
            .map { row -> row.children().map { parseInline(it, Formatting(), resolveUrl) } }
            .filter { cells -> cells.any { spans -> spans.any { it.text.isNotBlank() } } }
    if (headers.isEmpty() && bodyRows.isEmpty()) return null
    return ArticleBlock.Table(headers, bodyRows)
}
