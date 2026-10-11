package org.omicron.mobile.core.article

data class ArticleLanguage(
    val code: String,
    val name: String,
)

fun languageLabel(code: String?): String {
    if (code.isNullOrEmpty()) return ""
    return LANGUAGES.firstOrNull { it.code == code }?.name ?: code.uppercase()
}

private val LANGUAGES =
    listOf(
        ArticleLanguage("ar", "Arabic"),
        ArticleLanguage("az", "Azerbaijani"),
        ArticleLanguage("bn", "Bengali"),
        ArticleLanguage("bg", "Bulgarian"),
        ArticleLanguage("ca", "Catalan"),
        ArticleLanguage("zh", "Chinese"),
        ArticleLanguage("hr", "Croatian"),
        ArticleLanguage("cs", "Czech"),
        ArticleLanguage("da", "Danish"),
        ArticleLanguage("nl", "Dutch"),
        ArticleLanguage("en", "English"),
        ArticleLanguage("eo", "Esperanto"),
        ArticleLanguage("et", "Estonian"),
        ArticleLanguage("fi", "Finnish"),
        ArticleLanguage("fr", "French"),
        ArticleLanguage("de", "German"),
        ArticleLanguage("el", "Greek"),
        ArticleLanguage("he", "Hebrew"),
        ArticleLanguage("hi", "Hindi"),
        ArticleLanguage("hu", "Hungarian"),
        ArticleLanguage("id", "Indonesian"),
        ArticleLanguage("it", "Italian"),
        ArticleLanguage("ja", "Japanese"),
        ArticleLanguage("ko", "Korean"),
        ArticleLanguage("lv", "Latvian"),
        ArticleLanguage("lt", "Lithuanian"),
        ArticleLanguage("ms", "Malay"),
        ArticleLanguage("no", "Norwegian"),
        ArticleLanguage("fa", "Persian"),
        ArticleLanguage("pl", "Polish"),
        ArticleLanguage("pt", "Portuguese"),
        ArticleLanguage("ro", "Romanian"),
        ArticleLanguage("ru", "Russian"),
        ArticleLanguage("sr", "Serbian"),
        ArticleLanguage("sk", "Slovak"),
        ArticleLanguage("sl", "Slovenian"),
        ArticleLanguage("es", "Spanish"),
        ArticleLanguage("sv", "Swedish"),
        ArticleLanguage("th", "Thai"),
        ArticleLanguage("tr", "Turkish"),
        ArticleLanguage("uk", "Ukrainian"),
        ArticleLanguage("vi", "Vietnamese"),
    )
