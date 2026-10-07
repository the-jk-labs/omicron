package org.omicron.mobile.core.article

import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.BaselineShift
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
class MathContentTest {
    @Test
    fun linearizesInlineFormula() {
        val blocks =
            parseArticle(
                "<p>Einstein wrote <span class=\"katex\">" +
                    "<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow>" +
                    "<mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup>" +
                    "</mrow><annotation encoding=\"application/x-tex\">E = mc^2</annotation>" +
                    "</semantics></math></span> once.</p>",
            )

        val paragraph = blocks.single() as ArticleBlock.Paragraph
        assertEquals(listOf("Einstein wrote ", "", " once."), paragraph.content.map { it.text })
        val math = paragraph.content.single { it.math != null }.math!!
        assertFalse(math.sourceFallback)
        val styled = math.styled()
        assertEquals("E = mc2", styled.text)
        assertTrue(styled.spanStyles.any { styled.text.substring(it.start, it.end) == "E" && it.item.fontStyle == FontStyle.Italic })
        assertTrue(styled.spanStyles.any { styled.text.substring(it.start, it.end) == "2" && it.item.baselineShift == BaselineShift.Superscript })
    }

    @Test
    fun parsesDisplayFormulaAsCenteredBlock() {
        val blocks =
            parseArticle(
                "<p class=\"katex-block\"><span class=\"katex\">" +
                    "<math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"block\"><semantics><mrow>" +
                    "<mfrac><mi>a</mi><mi>b</mi></mfrac></mrow>" +
                    "<annotation encoding=\"application/x-tex\">\\frac{a}{b}</annotation>" +
                    "</semantics></math></span></p>",
            )

        val math = blocks.single() as ArticleBlock.Math
        assertFalse(math.content.sourceFallback)
        assertEquals("a⁄b", math.content.text.text)
    }

    @Test
    fun rendersErrorSourceAsCode() {
        val blocks = parseArticle("<p>broken <span class=\"katex-error\">\\frac{1</span></p>")

        val paragraph = blocks.single() as ArticleBlock.Paragraph
        val error = paragraph.content.single { it.text == "\\frac{1" }
        assertTrue(error.code)
    }

    @Test
    fun linearizesMatrices() {
        val blocks =
            parseArticle(
                "<p><math><mtable><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr>" +
                    "<mtr><mtd><mi>c</mi></mtd><mtd><mi>d</mi></mtd></mtr></mtable></math></p>",
            )

        val paragraph = blocks.single() as ArticleBlock.Paragraph
        assertEquals("[a, b; c, d]", paragraph.content.single { it.math != null }.math!!.text.text)
    }

    @Test
    fun keepsFencesTight() {
        val blocks =
            parseArticle(
                "<p><math><mrow><mo fence=\"true\">(</mo><mi>x</mi><mo fence=\"true\">)</mo></mrow></math></p>",
            )

        val paragraph = blocks.single() as ArticleBlock.Paragraph
        assertEquals("(x)", paragraph.content.single { it.math != null }.math!!.text.text)
    }

    @Test
    fun fallsBackToTexSource() {
        val blocks =
            parseArticle(
                "<p><math><semantics><annotation encoding=\"application/x-tex\">x^2</annotation></semantics></math></p>",
            )

        val paragraph = blocks.single() as ArticleBlock.Paragraph
        val math = paragraph.content.single { it.math != null }.math!!
        assertTrue(math.sourceFallback)
        assertEquals("x^2", math.text.text)
    }

    @Test
    fun dropsEmptyFormulae() {
        val blocks = parseArticle("<p><math><semantics></semantics></math></p>")

        assertEquals(emptyList(), blocks)
    }
}
