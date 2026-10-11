package org.omicron.mobile.core.article

import org.junit.Assert.assertEquals
import org.junit.Test

class LanguageLabelsTest {
    @Test
    fun knownCodeResolvesToEnglishName() {
        assertEquals("English", languageLabel("en"))
        assertEquals("Azerbaijani", languageLabel("az"))
        assertEquals("French", languageLabel("fr"))
    }

    @Test
    fun unknownCodeFallsBackToUppercase() {
        assertEquals("XX", languageLabel("xx"))
    }

    @Test
    fun missingCodeResolvesToEmpty() {
        assertEquals("", languageLabel(null))
        assertEquals("", languageLabel(""))
    }
}
