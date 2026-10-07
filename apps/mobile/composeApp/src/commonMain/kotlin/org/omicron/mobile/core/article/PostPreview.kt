package org.omicron.mobile.core.article

import com.fleeksoft.ksoup.Ksoup
import kotlin.math.roundToInt

data class PostPreview(
    val excerpt: String,
    val readingMinutes: Int,
)

fun postPreview(
    summary: String?,
    contentHtml: String,
    maxExcerptLength: Int = 180,
): PostPreview {
    val plainText = Ksoup.parse(contentHtml).body().text().replace(WHITESPACE, " ").trim()
    val excerpt = summary?.trim()?.takeIf(String::isNotEmpty) ?: excerpt(plainText, maxExcerptLength)
    val wordCount = plainText.split(WHITESPACE).count(String::isNotBlank)
    return PostPreview(excerpt, (wordCount / WORDS_PER_MINUTE).roundToInt().coerceAtLeast(1))
}

private fun excerpt(
    text: String,
    maxLength: Int,
): String {
    if (text.length <= maxLength) return text
    val clipped = text.take(maxLength)
    val lastSpace = clipped.lastIndexOf(' ')
    val head = if (lastSpace > maxLength * WORD_BOUNDARY_RATIO) clipped.take(lastSpace) else clipped
    return head.trimEnd { it.isWhitespace() || it in TRAILING_PUNCTUATION } + ELLIPSIS
}

private val WHITESPACE = Regex("\\s+")
private const val WORDS_PER_MINUTE = 200.0
private const val WORD_BOUNDARY_RATIO = 0.6
private const val TRAILING_PUNCTUATION = ".,;:!?-"
private const val ELLIPSIS = "…"
