package org.omicron.mobile.core.article

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import dev.snipme.highlights.Highlights
import dev.snipme.highlights.model.PhraseLocation
import dev.snipme.highlights.model.SyntaxLanguage

data class CodePalette(
    val comment: Color,
    val keyword: Color,
    val string: Color,
    val literal: Color,
    val type: Color,
)

fun highlightLanguage(declared: String?): SyntaxLanguage? {
    if (declared.isNullOrBlank()) return null
    return when (declared.lowercase()) {
        "c" -> SyntaxLanguage.C
        "cpp", "c++", "cc" -> SyntaxLanguage.CPP
        "csharp", "c#", "cs" -> SyntaxLanguage.CSHARP
        "coffeescript", "coffee" -> SyntaxLanguage.COFFEESCRIPT
        "dart" -> SyntaxLanguage.DART
        "go" -> SyntaxLanguage.GO
        "java" -> SyntaxLanguage.JAVA
        "javascript", "js", "jsx" -> SyntaxLanguage.JAVASCRIPT
        "kotlin", "kt", "kts" -> SyntaxLanguage.KOTLIN
        "perl", "pl" -> SyntaxLanguage.PERL
        "php" -> SyntaxLanguage.PHP
        "python", "py" -> SyntaxLanguage.PYTHON
        "ruby", "rb" -> SyntaxLanguage.RUBY
        "rust", "rs" -> SyntaxLanguage.RUST
        "shell", "sh", "bash", "zsh" -> SyntaxLanguage.SHELL
        "swift" -> SyntaxLanguage.SWIFT
        "typescript", "ts", "tsx" -> SyntaxLanguage.TYPESCRIPT
        else -> null
    }
}

fun highlightCode(
    code: String,
    language: SyntaxLanguage,
    palette: CodePalette,
): AnnotatedString {
    if (code.isEmpty()) return AnnotatedString("")
    val structure =
        runCatching {
            Highlights.Builder().code(code).language(language).build().getCodeStructure()
        }.getOrNull() ?: return AnnotatedString(code)
    return buildAnnotatedString {
        append(code)
        val commentStyle = SpanStyle(color = palette.comment, fontStyle = FontStyle.Italic)
        structure.multilineComments.forEach { paint(it, code.length, commentStyle) }
        structure.comments.forEach { paint(it, code.length, commentStyle) }
        structure.strings.forEach { paint(it, code.length, SpanStyle(color = palette.string)) }
        structure.literals.forEach { paint(it, code.length, SpanStyle(color = palette.literal)) }
        structure.annotations.forEach { paint(it, code.length, SpanStyle(color = palette.type)) }
        structure.keywords.forEach { paint(it, code.length, SpanStyle(color = palette.keyword)) }
    }
}

private fun AnnotatedString.Builder.paint(
    location: PhraseLocation,
    length: Int,
    style: SpanStyle,
) {
    val start = location.start.coerceIn(0, length)
    val end = location.end.coerceIn(start, length)
    if (start < end) addStyle(style, start, end)
}
