package org.omicron.mobile.feature.reader

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.omicron.mobile.core.article.ArticleBlock
import org.omicron.mobile.core.article.ArticleSpan
import org.omicron.mobile.core.article.CodePalette
import org.omicron.mobile.core.article.InlineContent
import org.omicron.mobile.core.article.highlightCode
import org.omicron.mobile.core.article.highlightLanguage
import org.omicron.mobile.core.article.styled
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun ArticleBody(
    blocks: List<ArticleBlock>,
    modifier: Modifier = Modifier,
) {
    val linkColor = RikkaTheme.colors.primary
    val textColor = RikkaTheme.colors.onBackground
    SelectionContainer {
        Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            blocks.forEach { block ->
                when (block) {
                    is ArticleBlock.Heading ->
                        RichText(
                            text = block.content.toAnnotatedString(linkColor, textColor),
                            variant = if (block.level <= 2) TextVariant.H2 else TextVariant.H3,
                            heading = true,
                        )
                    is ArticleBlock.Paragraph ->
                        RichText(text = block.content.toAnnotatedString(linkColor, textColor), variant = TextVariant.P)
                    is ArticleBlock.Quote ->
                        Box(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .background(RikkaTheme.colors.muted, RikkaTheme.shapes.md)
                                    .padding(12.dp),
                        ) {
                            ArticleBody(blocks = block.blocks)
                        }
                    is ArticleBlock.CodeBlock -> HighlightedCodeBlock(block = block)
                    is ArticleBlock.BulletList ->
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            block.items.forEach { item ->
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    RichText(text = AnnotatedString("•"), variant = TextVariant.P)
                                    RichText(
                                        text = item.toAnnotatedString(linkColor, textColor),
                                        variant = TextVariant.P,
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                        }
                    is ArticleBlock.OrderedList ->
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            block.items.forEachIndexed { index, item ->
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    RichText(text = AnnotatedString("${index + 1}."), variant = TextVariant.P)
                                    RichText(
                                        text = item.toAnnotatedString(linkColor, textColor),
                                        variant = TextVariant.P,
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                        }
                    is ArticleBlock.Image -> ArticleImage(url = block.url, description = block.alt)
                    is ArticleBlock.Table -> ArticleTable(block = block)
                    is ArticleBlock.Math -> ArticleMath(block = block)
                    is ArticleBlock.Divider ->
                        Box(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .background(RikkaTheme.colors.border)
                                    .padding(vertical = 0.5.dp),
                        )
                    is ArticleBlock.PlainText -> RichText(text = AnnotatedString(block.text), variant = TextVariant.P)
                }
            }
        }
    }
}

@Composable
private fun HighlightedCodeBlock(block: ArticleBlock.CodeBlock) {
    val code = OmicronTheme.code
    val palette =
        remember(code) {
            CodePalette(
                comment = code.comment,
                keyword = code.keyword,
                string = code.string,
                literal = code.literal,
                type = code.type,
            )
        }
    val language = remember(block.language) { highlightLanguage(block.language) }
    val highlighted by produceState(AnnotatedString(block.code), block.code, language, palette) {
        value =
            if (language == null) {
                AnnotatedString(block.code)
            } else {
                withContext(Dispatchers.Default) { highlightCode(block.code, language, palette) }
            }
    }
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(RikkaTheme.colors.muted, RikkaTheme.shapes.md)
                .padding(12.dp),
    ) {
        RichText(
            text = highlighted,
            variant = TextVariant.Small,
            style = TextStyle(fontFamily = FontFamily.Monospace),
        )
    }
}

@Composable
private fun RichText(
    text: AnnotatedString,
    variant: TextVariant,
    modifier: Modifier = Modifier,
    heading: Boolean = false,
    style: TextStyle = TextStyle.Default,
) {
    val baseStyle =
        when (variant) {
            TextVariant.H1 -> RikkaTheme.typography.h1
            TextVariant.H2 -> RikkaTheme.typography.h2
            TextVariant.H3 -> RikkaTheme.typography.h3
            TextVariant.H4 -> RikkaTheme.typography.h4
            TextVariant.P -> RikkaTheme.typography.p
            TextVariant.Lead -> RikkaTheme.typography.lead
            TextVariant.Large -> RikkaTheme.typography.large
            TextVariant.Small -> RikkaTheme.typography.small
            TextVariant.Muted -> RikkaTheme.typography.muted
        }
    val color =
        when (variant) {
            TextVariant.Lead, TextVariant.Muted -> RikkaTheme.colors.onMuted
            else -> RikkaTheme.colors.onBackground
        }
    val contentStyle = baseStyle.merge(TextStyle(fontFamily = OmicronTheme.contentFontFamily))
    BasicText(
        text = text,
        modifier = if (heading) modifier.semantics { heading() } else modifier,
        style = contentStyle.merge(style).merge(TextStyle(color = color)),
    )
}

@Composable
private fun ArticleImage(
    url: String,
    description: String?,
) {
    var failed by remember(url) { mutableStateOf(false) }
    if (failed) return
    AsyncImage(
        model = url,
        contentDescription = description,
        contentScale = ContentScale.FillWidth,
        onError = { failed = true },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
fun CoverImage(
    url: String,
    modifier: Modifier = Modifier,
) {
    var failed by remember(url) { mutableStateOf(false) }
    if (failed) return
    AsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        onError = { failed = true },
        modifier = modifier.fillMaxWidth().aspectRatio(16f / 9f),
    )
}

@Composable
private fun ArticleTable(block: ArticleBlock.Table) {
    val linkColor = RikkaTheme.colors.primary
    val textColor = RikkaTheme.colors.onBackground
    val columnCount = tableColumnCount(block)
    if (columnCount == 0) return
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val cellWidth = tableCellWidth(columnCount, maxWidth)
        val tableModifier =
            if (cellWidth == null) {
                Modifier.fillMaxWidth()
            } else {
                Modifier.width(cellWidth * columnCount).horizontalScroll(rememberScrollState())
            }
        Column(
            modifier =
                tableModifier
                    .border(1.dp, RikkaTheme.colors.border)
                    .background(RikkaTheme.colors.background),
        ) {
            if (block.headers.isNotEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().background(RikkaTheme.colors.muted)) {
                    TableRow(
                        cells = block.headers.padTo(columnCount),
                        linkColor = linkColor,
                        textColor = textColor,
                        cellWidth = cellWidth,
                        header = true,
                    )
                }
                TableDivider()
            }
            block.rows.forEachIndexed { index, row ->
                TableRow(
                    cells = row.padTo(columnCount),
                    linkColor = linkColor,
                    textColor = textColor,
                    cellWidth = cellWidth,
                    header = false,
                )
                if (index != block.rows.lastIndex) TableDivider()
            }
        }
    }
}

@Composable
private fun TableRow(
    cells: List<InlineContent>,
    linkColor: Color,
    textColor: Color,
    cellWidth: Dp?,
    header: Boolean,
) {
    Row(modifier = Modifier.fillMaxWidth()) {
        cells.forEach { cell ->
            val cellModifier =
                if (cellWidth == null) {
                    Modifier.weight(1f)
                } else {
                    Modifier.width(cellWidth)
                }
            RichText(
                text = cell.toAnnotatedString(linkColor, textColor),
                variant = TextVariant.Small,
                style = if (header) TextStyle(fontWeight = FontWeight.Bold) else TextStyle.Default,
                modifier = cellModifier.padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
private fun TableDivider() {
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(RikkaTheme.colors.border)
                .padding(vertical = 0.5.dp),
    )
}

internal fun tableColumnCount(block: ArticleBlock.Table): Int =
    maxOf(block.headers.size, block.rows.maxOfOrNull { it.size } ?: 0)

internal fun tableCellWidth(
    columnCount: Int,
    maxWidth: Dp,
    minCellWidth: Dp = 120.dp,
): Dp? {
    if (columnCount <= 0) return null
    return if (minCellWidth * columnCount <= maxWidth) null else minCellWidth
}

private fun List<InlineContent>.padTo(columnCount: Int): List<InlineContent> =
    if (size >= columnCount) {
        take(columnCount)
    } else {
        this + List(columnCount - size) { emptyList() }
    }

@Composable
private fun ArticleMath(block: ArticleBlock.Math) {
    Box(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        contentAlignment = Alignment.Center,
    ) {
        RichText(
            text = block.content.styled(),
            variant = TextVariant.P,
            style = TextStyle(textAlign = TextAlign.Center),
        )
    }
}

private fun InlineContent.toAnnotatedString(linkColor: Color, textColor: Color): AnnotatedString =
    buildAnnotatedString {
        forEach { span ->
            if (span.link != null) pushLink(LinkAnnotation.Url(span.link))
            if (span.math != null) {
                append(span.math.styled())
            } else {
                withStyle(span.toStyle(linkColor, textColor)) { append(span.text) }
            }
            if (span.link != null) pop()
        }
    }

private fun ArticleSpan.toStyle(linkColor: Color, textColor: Color): SpanStyle {
    return SpanStyle(
        fontWeight = if (bold) FontWeight.Bold else null,
        fontStyle = if (italic) FontStyle.Italic else null,
        fontFamily = if (code) FontFamily.Monospace else null,
        textDecoration =
            buildSet {
                if (strikethrough) add(TextDecoration.LineThrough)
                if (underline || link != null) add(TextDecoration.Underline)
            }.takeIf { it.isNotEmpty() }?.combine(),
        color = if (link != null) linkColor else textColor,
    )
}

private fun Set<TextDecoration>.combine(): TextDecoration = reduce { acc, decoration -> acc + decoration }
