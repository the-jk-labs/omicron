package org.omicron.mobile.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue
import org.omicron.mobile.domain.model.ComposerBlock
import org.omicron.mobile.domain.model.hasContent
import org.omicron.mobile.domain.model.parseComposerHtml
import org.omicron.mobile.domain.model.toHtml

class ComposerHtmlTest {
    @Test
    fun textBlocksSerializeToSanitizedHtml() {
        val html =
            listOf(
                ComposerBlock.Paragraph(id = "a", text = "Hello"),
                ComposerBlock.Heading(id = "b", level = 2, text = "Title"),
                ComposerBlock.Quote(id = "c", text = "Quoted"),
                ComposerBlock.Code(id = "d", text = "val x = 1"),
            ).toHtml()

        assertEquals("<p>Hello</p><h2>Title</h2><blockquote>Quoted</blockquote><pre><code>val x = 1</code></pre>", html)
    }

    @Test
    fun textIsEscapedAndNewlinesBecomeBreaks() {
        val html = listOf(ComposerBlock.Paragraph(id = "a", text = "a<b>&\"c\nline")).toHtml()

        assertEquals("<p>a&lt;b&gt;&amp;&quot;c<br>line</p>", html)
    }

    @Test
    fun listsImagesAndDividersSerialize() {
        val html =
            listOf(
                ComposerBlock.BulletList(id = "a", items = listOf("one", "two")),
                ComposerBlock.OrderedList(id = "b", items = listOf("first")),
                ComposerBlock.Image(id = "c", url = "/api/uploads/x.png", alt = "A \"photo\""),
                ComposerBlock.Divider(id = "d"),
            ).toHtml()

        assertEquals(
            "<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>" +
                "<img src=\"/api/uploads/x.png\" alt=\"A &quot;photo&quot;\"><hr>",
            html,
        )
    }

    @Test
    fun blankBlocksAreSkipped() {
        val html =
            listOf(
                ComposerBlock.Paragraph(id = "a", text = "  "),
                ComposerBlock.BulletList(id = "b", items = listOf("", "  ")),
                ComposerBlock.Image(id = "c", url = "  "),
                ComposerBlock.Divider(id = "d"),
                ComposerBlock.Paragraph(id = "e", text = "Kept"),
            ).toHtml()

        assertEquals("<hr><p>Kept</p>", html)
    }

    @Test
    fun headingLevelIsClamped() {
        assertEquals("<h1>Hi</h1>", listOf(ComposerBlock.Heading(id = "a", level = 0, text = "Hi")).toHtml())
        assertEquals("<h6>Hi</h6>", listOf(ComposerBlock.Heading(id = "a", level = 9, text = "Hi")).toHtml())
    }

    @Test
    fun rawHtmlPassesThroughVerbatim() {
        val raw = "<table><tr><td>cell</td></tr></table>"
        val blocks = parseComposerHtml(raw)

        assertEquals(1, blocks.size)
        val block = blocks.single()
        assertIs<ComposerBlock.RawHtml>(block)
        assertTrue(block.html.contains("cell"))
        assertEquals(blocks.toHtml(), parseComposerHtml(blocks.toHtml()).toHtml())
    }

    @Test
    fun supportedConstructsParseBackToEditableBlocks() {
        val blocks =
            parseComposerHtml(
                "<h1>Title</h1><p>One<br>Two</p><blockquote>Quoted</blockquote>" +
                    "<pre><code>code</code></pre><ul><li>a</li><li>b</li></ul><hr>",
            )

        assertEquals(6, blocks.size)
        assertIs<ComposerBlock.Heading>(blocks[0])
        assertEquals(1, (blocks[0] as ComposerBlock.Heading).level)
        assertEquals("Title", (blocks[0] as ComposerBlock.Heading).text)
        assertEquals("One\nTwo", (blocks[1] as ComposerBlock.Paragraph).text)
        assertEquals("Quoted", (blocks[2] as ComposerBlock.Quote).text)
        assertEquals("code", (blocks[3] as ComposerBlock.Code).text)
        assertEquals(listOf("a", "b"), (blocks[4] as ComposerBlock.BulletList).items)
        assertIs<ComposerBlock.Divider>(blocks[5])
        assertTrue(blocks.map { it.id }.toSet().size == 6)
    }

    @Test
    fun linksAndRichInlineContentArePreservedOpaquely() {
        val html = "<p>Read <a href=\"https://example.com\">this</a> now</p>"
        val blocks = parseComposerHtml(html)

        assertEquals(1, blocks.size)
        assertIs<ComposerBlock.RawHtml>(blocks.single())
        assertEquals(html, blocks.toHtml())
    }

    @Test
    fun mobileOutputRoundTripsLosslessly() {
        val blocks =
            listOf(
                ComposerBlock.Paragraph(id = "a", text = "Hello & welcome"),
                ComposerBlock.Heading(id = "b", level = 3, text = "Section"),
                ComposerBlock.BulletList(id = "c", items = listOf("x", "y")),
                ComposerBlock.Code(id = "d", text = "a < b", language = "kotlin"),
                ComposerBlock.Divider(id = "e"),
            )

        val reparsed = parseComposerHtml(blocks.toHtml())

        assertEquals(blocks.toHtml(), reparsed.toHtml())
    }

    @Test
    fun emptyInputParsesToNoBlocks() {
        assertTrue(parseComposerHtml("").isEmpty())
        assertTrue(parseComposerHtml("   ").isEmpty())
        assertTrue(parseComposerHtml("<p>   </p>").isEmpty())
    }

    @Test
    fun hasContentIgnoresBlanksAndDividers() {
        assertFalse(emptyList<ComposerBlock>().hasContent())
        assertFalse(listOf(ComposerBlock.Paragraph(id = "a", text = "  ")).hasContent())
        assertFalse(listOf(ComposerBlock.Divider(id = "a")).hasContent())
        assertTrue(listOf(ComposerBlock.Paragraph(id = "a", text = "Hi")).hasContent())
        assertTrue(listOf(ComposerBlock.RawHtml(id = "a", html = "<hr>")).hasContent())
    }
}
