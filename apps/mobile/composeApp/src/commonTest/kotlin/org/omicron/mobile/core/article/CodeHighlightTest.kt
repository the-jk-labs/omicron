package org.omicron.mobile.core.article

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import dev.snipme.highlights.model.SyntaxLanguage
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CodeHighlightTest {
    private val palette =
        CodePalette(
            comment = Color.Gray,
            keyword = Color.Red,
            string = Color.Green,
            literal = Color.Blue,
            type = Color.Magenta,
        )

    @Test
    fun resolvesDeclaredLanguagesAndAliases() {
        assertEquals(SyntaxLanguage.KOTLIN, highlightLanguage("kotlin"))
        assertEquals(SyntaxLanguage.TYPESCRIPT, highlightLanguage("ts"))
        assertEquals(SyntaxLanguage.TYPESCRIPT, highlightLanguage("tsx"))
        assertEquals(SyntaxLanguage.JAVASCRIPT, highlightLanguage("jsx"))
        assertEquals(SyntaxLanguage.SHELL, highlightLanguage("bash"))
        assertEquals(SyntaxLanguage.CPP, highlightLanguage("c++"))
        assertEquals(SyntaxLanguage.CSHARP, highlightLanguage("cs"))
    }

    @Test
    fun leavesUndeclaredAndUncoveredLanguagesPlain() {
        assertNull(highlightLanguage(null))
        assertNull(highlightLanguage(""))
        assertNull(highlightLanguage("dockerfile"))
        assertNull(highlightLanguage("plaintext"))
    }

    @Test
    fun paintsKeywordsLiteralsAndComments() {
        val code = "val x = 1 // count"
        val highlighted = highlightCode(code, SyntaxLanguage.KOTLIN, palette)

        assertEquals(code, highlighted.text)
        assertTrue(highlighted.spanStyles.any { it.item.color == palette.keyword && code.substring(it.start, it.end) == "val" })
        assertTrue(highlighted.spanStyles.any { it.item.color == palette.literal && code.substring(it.start, it.end) == "1" })
        val comment = highlighted.spanStyles.single { code.substring(it.start, it.end) == "// count" }
        assertEquals(palette.comment, comment.item.color)
        assertEquals(FontStyle.Italic, comment.item.fontStyle)
    }

    @Test
    fun paintsStrings() {
        val code = "val name = \"Ada\""
        val highlighted = highlightCode(code, SyntaxLanguage.KOTLIN, palette)

        assertTrue(highlighted.spanStyles.any { it.item.color == palette.string && code.substring(it.start, it.end) == "\"Ada\"" })
    }

    @Test
    fun returnsPlainTextForEmptyCode() {
        val highlighted = highlightCode("", SyntaxLanguage.KOTLIN, palette)

        assertEquals("", highlighted.text)
        assertTrue(highlighted.spanStyles.isEmpty())
    }
}
