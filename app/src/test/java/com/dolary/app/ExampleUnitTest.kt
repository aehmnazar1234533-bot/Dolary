package com.dolary.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RateAlertEvaluatorTest {
    private fun evaluate(
        old: Map<String, Int>,
        new: Map<String, Int>,
        targets: List<String> = listOf("بغداد"),
        enabled: Boolean = false,
        targetRate: Int = 0,
        direction: String = "above",
        lastAlerts: Map<String, Long> = emptyMap()
    ) = RateAlertEvaluator.evaluate(
        oldRates = old,
        newRates = new,
        targetProvinces = targets,
        targetEnabled = enabled,
        targetProvince = "بغداد",
        targetRate = targetRate,
        targetDirection = direction,
        lastAlertTimes = lastAlerts,
        nowMillis = 10_000_000L,
        cooldownMillis = 1_800_000L
    )

    @Test fun movementBelowThresholdDoesNotAlert() {
        assertTrue(evaluate(mapOf("بغداد" to 150000), mapOf("بغداد" to 150024)).isEmpty())
    }

    @Test fun movementAtThresholdAlerts() {
        assertEquals(listOf(RateChange("بغداد", 150000, 150025)),
            evaluate(mapOf("بغداد" to 150000), mapOf("بغداد" to 150025)))
    }

    @Test fun cooldownSuppressesRepeatedMovement() {
        assertTrue(evaluate(mapOf("بغداد" to 150000), mapOf("بغداد" to 150100),
            lastAlerts = mapOf("بغداد" to 9_000_000L)).isEmpty())
    }

    @Test fun targetCrossingAlertsEvenDuringCooldown() {
        assertEquals(listOf(RateChange("بغداد", 149900, 150000)),
            evaluate(mapOf("بغداد" to 149900), mapOf("بغداد" to 150000),
                enabled = true, targetRate = 150000,
                lastAlerts = mapOf("بغداد" to 9_999_999L)))
    }

    @Test fun belowTargetCrossingIsDetected() {
        assertEquals(listOf(RateChange("بغداد", 150100, 150000)),
            evaluate(mapOf("بغداد" to 150100), mapOf("بغداد" to 150000),
                enabled = true, targetRate = 150000, direction = "below"))
    }

    @Test fun onlySelectedProvincesAreEvaluated() {
        assertEquals(listOf("بغداد"),
            evaluate(mapOf("بغداد" to 150000, "البصرة" to 150000),
                mapOf("بغداد" to 150050, "البصرة" to 150100),
                targets = listOf("بغداد")).map { it.province })
    }

    @Test fun missingProvinceDataIsIgnored() {
        assertTrue(evaluate(mapOf("بغداد" to 150000), mapOf("البصرة" to 150100)).isEmpty())
    }
}
