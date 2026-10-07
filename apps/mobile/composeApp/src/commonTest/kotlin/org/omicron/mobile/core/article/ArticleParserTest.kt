package org.omicron.mobile.core.article

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class ArticleParserTest {
    @Test
    fun parsesTextBlocksAndInlineFormatting() {
        val blocks =
            parseArticle(
                "<h2>Title</h2><p>Hello <strong>bold</strong> and <em>italic</em> with <code>code</code> and <a href=\"https://example.com\">link</a>.</p>",
            )

        assertEquals(2, blocks.size)
        val heading = blocks[0] as ArticleBlock.Heading
        assertEquals(2, heading.level)
        assertEquals("Title", heading.content.single().text)
        val paragraph = blocks[1] as ArticleBlock.Paragraph
        val bold = paragraph.content.single { it.text == "bold" }
        assertTrue(bold.bold)
        val italic = paragraph.content.single { it.text == "italic" }
        assertTrue(italic.italic)
        val code = paragraph.content.single { it.text == "code" }
        assertTrue(code.code)
        val link = paragraph.content.single { it.text == "link" }
        assertEquals("https://example.com", link.link)
    }

    @Test
    fun parsesListsCodeImagesAndDividers() {
        val blocks =
            parseArticle(
                "<ul><li>First</li><li>Second</li></ul><ol><li>One</li></ol><pre><code class=\"language-kotlin\">val x = 1</code></pre><p><img src=\"/uploads/a.jpg\" alt=\"A\" /></p><hr />",
                resolveUrl = { "https://omicron.blog$it" },
            )

        assertIs<ArticleBlock.BulletList>(blocks[0])
        assertEquals(listOf("First", "Second"), (blocks[0] as ArticleBlock.BulletList).items.map { it.single().text })
        assertIs<ArticleBlock.OrderedList>(blocks[1])
        val code = blocks[2] as ArticleBlock.CodeBlock
        assertEquals("val x = 1", code.code)
        assertEquals("kotlin", code.language)
        val image = blocks[3] as ArticleBlock.Image
        assertEquals("https://omicron.blog/uploads/a.jpg", image.url)
        assertEquals("A", image.alt)
        assertIs<ArticleBlock.Divider>(blocks[4])
    }

    @Test
    fun parsesBlockquotesAndTables() {
        val blocks =
            parseArticle(
                "<blockquote><p>Quoted</p></blockquote><table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Alice</td></tr></tbody></table>",
            )

        val quote = blocks[0] as ArticleBlock.Quote
        assertEquals("Quoted", (quote.blocks.single() as ArticleBlock.Paragraph).content.single().text)
        val table = blocks[1] as ArticleBlock.Table
        assertEquals("Name", table.headers.single().single().text)
        assertEquals("Alice", table.rows.single().single().single().text)
    }

    @Test
    fun degradesUnsupportedConstructsToReadableText() {
        val blocks =
            parseArticle(
                "<details><summary>More</summary><p>Hidden</p></details><p><math><mi>x</mi></math></p>",
            )

        val texts = blocks.map { (it as ArticleBlock.Paragraph).content.single().text }
        assertEquals(listOf("More", "Hidden", "x"), texts)
    }

    @Test
    fun returnsEmptyForBlankHtml() {
        assertEquals(emptyList(), parseArticle(""))
        assertEquals(emptyList(), parseArticle("   "))
    }
}
