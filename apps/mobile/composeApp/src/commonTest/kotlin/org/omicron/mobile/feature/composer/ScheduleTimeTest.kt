package org.omicron.mobile.feature.composer

import kotlinx.datetime.TimeZone
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant

class ScheduleTimeTest {
    private val clock =
        object : Clock {
            override fun now(): Instant = Instant.parse("2026-10-09T12:00:00Z")
        }
    private val zone = TimeZone.UTC

    @Test
    fun presetsAreFutureAndAscending() {
        val presets = schedulePresets(clock, zone)

        assertEquals(3, presets.size)
        assertTrue(presets.zipWithNext().all { (first, second) -> first < second })
        assertTrue(presets.all { it.isSchedulable(clock) })
        assertEquals("2026-10-09T13:00:00Z", presets[0].toString())
        assertEquals("2026-10-10T09:00:00Z", presets[1].toString())
        assertEquals("2026-10-12T09:00:00Z", presets[2].toString())
    }

    @Test
    fun parseRoundTripsThroughInputs() {
        val at = parseScheduleInput("2026-10-10", "09:30", zone)

        assertEquals(Instant.parse("2026-10-10T09:30:00Z"), at)
        assertEquals("2026-10-10" to "09:30", at?.toScheduleInput(zone))
    }

    @Test
    fun parseRejectsMalformedInput() {
        assertNull(parseScheduleInput("10/10/2026", "09:00", zone))
        assertNull(parseScheduleInput("2026-10-10", "9am", zone))
        assertNull(parseScheduleInput("2026-13-10", "09:00", zone))
        assertNull(parseScheduleInput("2026-10-10", "25:00", zone))
    }

    @Test
    fun leadTimeBoundary() {
        val now = clock.now()

        assertTrue((now + 61.seconds).isSchedulable(clock))
        assertFalse((now + 59.seconds).isSchedulable(clock))
    }

    @Test
    fun formatShowsLocalTimeAndZone() {
        assertEquals("10 Oct 2026, 09:00 · UTC", formatScheduledFor("2026-10-10T09:00:00Z", zone))
        assertNull(formatScheduledFor("not-a-date", zone))
    }
}
