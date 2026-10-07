package org.omicron.mobile.core.article

import kotlin.test.Test
import kotlin.test.assertEquals

class PostPreviewTest {
    @Test
    fun usesThePublishedSummaryAndCalculatesReadingTimeFromTheArticle() {
        val body = List(300) { "word" }.joinToString(" ")

        val preview = postPreview("  Published summary  ", "<p>$body</p>")

        assertEquals("Published summary", preview.excerpt)
        assertEquals(2, preview.readingMinutes)
    }

    @Test
    fun derivesAnHtmlExcerptAtAWordBoundaryAndDecodesEntities() {
        val body = "A readable excerpt with &amp; decoded entities and enough words to exercise a clipped preview.".repeat(2)

        val preview = postPreview(null, "<p>$body</p>", maxExcerptLength = 48)

        assertEquals("A readable excerpt with & decoded entities and…", preview.excerpt)
        assertEquals(1, preview.readingMinutes)
    }

    @Test
    fun returnsOneMinuteForAnEmptyArticle() {
        assertEquals(PostPreview("", 1), postPreview(" ", "<p></p>"))
    }
}
