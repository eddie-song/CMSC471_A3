(function () {
    const margin = { top: 60, right: 130, bottom: 60, left: 70 };
    const width = 900 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;
    let allData;
    let countryCodes;

    const svgContainer = d3.select("#vis");
    const svg = svgContainer.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const tooltip = d3.select("#tooltip")
        .style("position", "absolute")
        .style("background", "#fff")
        .style("padding", "5px")
        .style("border", "1px solid #ccc")
        .style("border-radius", "4px")
        .style("pointer-events", "none");

    d3.csv("data/OECD.ENV.EPI,DSD_AIR_GHG@DF_AIR_GHG,+.A.GHG._T.KG_CO2E_PS.csv").then(data => {
        data.forEach(d => {
            d.TIME_PERIOD = +d.TIME_PERIOD;
            d.OBS_VALUE = +d.OBS_VALUE;
        });

        allData = data.filter(d => d.REF_AREA && d.TIME_PERIOD && d.OBS_VALUE);
        countryCodes = Array.from(new Set(allData.map(d => d.REF_AREA))).sort();
        const latestYear = d3.max(allData, d => d.TIME_PERIOD);

        const countriesWithMissingData = new Set();
        for (const code of countryCodes) {
            const hasLatest = allData.some(d => d.REF_AREA === code && d.TIME_PERIOD === latestYear);
            if (!hasLatest) countriesWithMissingData.add(code);
        }

        const checkboxContainer = d3.select("#checkbox-container-white");

        checkboxContainer.append("div").html(`
            <label><input type="checkbox" id="show-total-all"> Show Total (All Countries)</label><br>
            <label><input type="checkbox" id="show-total-complete"> Show Total (Complete Data Only)</label>
        `);

        checkboxContainer.selectAll(".country-check")
            .data(countryCodes)
            .enter()
            .append("div")
            .attr("class", "checkbox")
            .each(function (d) {
                d3.select(this)
                    .append("input")
                    .attr("type", "checkbox")
                    .attr("value", d)
                    .attr("id", `white-chk-${d}`)
                    .classed("country-checkbox", true)
                    .property("checked", false);

                d3.select(this)
                    .append("label")
                    .attr("for", `white-chk-${d}`)
                    .text(countriesWithMissingData.has(d) ? ` ${d} *` : ` ${d}`);
            });

        renderChart([]);

        d3.selectAll("#checkbox-container-white input[type=checkbox]").on("change", function () {
            const showTotalAll = d3.select("#show-total-all").property("checked");
            const showTotalComplete = d3.select("#show-total-complete").property("checked");

            const disableCountries = showTotalAll || showTotalComplete;

            d3.selectAll(".country-checkbox").property("disabled", disableCountries);
            if ((this.id === "show-total-all" || this.id === "show-total-complete") && this.checked) {
                d3.selectAll(".country-checkbox").property("checked", false);
            }

            const selected = getSelectedCountries();
            if (!this.id.includes("show-total") && selected.length > 5) {
                this.checked = false;
                return;
            }

            renderChart(selected);
        });

    }).catch(error => console.error("Error loading data:", error));

    function getSelectedCountries() {
        const selected = [];
        d3.selectAll(".country-checkbox:checked").each(function () {
            selected.push(this.value);
        });
        return selected;
    }

    function renderChart(selectedCountries) {
        svg.selectAll("*").remove();

        const showTotalAll = d3.select("#show-total-all").property("checked");
        const showTotalComplete = d3.select("#show-total-complete").property("checked");
        const filtered = allData.filter(d => selectedCountries.includes(d.REF_AREA));
        const nested = d3.group(filtered, d => d.REF_AREA);
        const latestYear = d3.max(allData, d => d.TIME_PERIOD);
        const totalsToPlot = [];

        const selectedTotals = d3.rollups(
            filtered,
            v => d3.sum(v, d => d.OBS_VALUE),
            d => d.TIME_PERIOD
        ).map(([year, value]) => ({ TIME_PERIOD: +year, OBS_VALUE: value }))
            .sort((a, b) => a.TIME_PERIOD - b.TIME_PERIOD);

        if (showTotalAll) {
            const totalAll = d3.rollups(
                allData,
                v => d3.sum(v, d => d.OBS_VALUE),
                d => d.TIME_PERIOD
            ).map(([year, value]) => ({ TIME_PERIOD: +year, OBS_VALUE: value }))
                .sort((a, b) => a.TIME_PERIOD - b.TIME_PERIOD);
            totalsToPlot.push({ label: "Total (All)", data: totalAll, color: "#000" });
        }

        if (showTotalComplete) {
            const completeCountryCodes = countryCodes.filter(code =>
                allData.some(d => d.REF_AREA === code && d.TIME_PERIOD === latestYear)
            );
            const completeData = allData.filter(d => completeCountryCodes.includes(d.REF_AREA));

            const totalComplete = d3.rollups(
                completeData,
                v => d3.sum(v, d => d.OBS_VALUE),
                d => d.TIME_PERIOD
            ).map(([year, value]) => ({ TIME_PERIOD: +year, OBS_VALUE: value }))
                .sort((a, b) => a.TIME_PERIOD - b.TIME_PERIOD);

            totalsToPlot.push({ label: "Total (Complete)", data: totalComplete, color: "#555" });
        }

        const allValues = [
            ...filtered,
            ...selectedTotals,
            ...totalsToPlot.flatMap(t => t.data)
        ];

        const yMax = d3.max(allValues, d => d.OBS_VALUE);
        const x = d3.scaleLinear()
            .domain(d3.extent(allData, d => d.TIME_PERIOD))
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([0, yMax || 1]).nice()
            .range([height, 0]);

        const xAxis = d3.axisBottom(x).tickFormat(d3.format("d"));
        const yAxis = d3.axisLeft(y);

        svg.append("g").attr("transform", `translate(0,${height})`).call(xAxis);
        svg.append("g").call(yAxis);

        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height + 40)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .text("Year");

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2)
            .attr("y", -50)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .text("GHG Emissions (kg CO₂e per capita)");

        svg.append("text")
            .attr("x", width / 2)
            .attr("y", -30)
            .attr("text-anchor", "middle")
            .style("font-size", "18px")
            .style("font-weight", "bold")
            .text("Greenhouse Gas Emissions Over Time");

        const color = d3.scaleOrdinal(d3.schemeCategory10);
        const line = d3.line()
            .defined(d => !isNaN(d.OBS_VALUE))
            .x(d => x(d.TIME_PERIOD))
            .y(d => y(d.OBS_VALUE));

        const placedLabelYs = [];

        function getNonOverlappingY(desiredY, minDistance = 14) {
            let finalY = desiredY;
            while (placedLabelYs.some(y => Math.abs(y - finalY) < minDistance)) {
                finalY += minDistance;
            }
            placedLabelYs.push(finalY);
            return finalY;
        }

        for (const [country, values] of nested) {
            values.sort((a, b) => a.TIME_PERIOD - b.TIME_PERIOD);

            svg.append("path")
                .datum(values)
                .attr("fill", "none")
                .attr("stroke", color(country))
                .attr("stroke-width", 2)
                .attr("d", line);

            const last = values.filter(d => !isNaN(d.OBS_VALUE)).at(-1);
            if (last) {
                const labelY = getNonOverlappingY(y(last.OBS_VALUE));
                svg.append("text")
                    .attr("x", x(last.TIME_PERIOD) + 5)
                    .attr("y", labelY)
                    .attr("fill", color(country))
                    .style("font-size", "12px")
                    .text(country);
            }

            svg.selectAll(`circle-${country}`)
                .data(values)
                .enter()
                .append("circle")
                .attr("cx", d => x(d.TIME_PERIOD))
                .attr("cy", d => y(d.OBS_VALUE))
                .attr("r", 3)
                .style("fill", color(country))
                .on("mouseover", (event, d) => {
                    tooltip.style("display", "block")
                        .html(`Country: ${d.REF_AREA}<br>Year: ${d.TIME_PERIOD}<br>Value: ${d.OBS_VALUE.toFixed(2)}`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", () => tooltip.style("display", "none"));
        }
        svg.append("path")
            .datum(selectedTotals)
            .attr("fill", "none")
            .attr("stroke", "black")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "5,2")
            .attr("d", line);

        const lastSelected = selectedTotals.at(-1);
        if (lastSelected) {
            const labelY = getNonOverlappingY(y(lastSelected.OBS_VALUE));
            svg.append("text")
                .attr("x", x(lastSelected.TIME_PERIOD) + 5)
                .attr("y", labelY)
                .attr("fill", "black")
                .style("font-size", "12px")
                .text("Total (Selected)");
        }

        for (const { label, data, color: lineColor } of totalsToPlot) {
            svg.append("path")
                .datum(data)
                .attr("fill", "none")
                .attr("stroke", lineColor)
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "5,2")
                .attr("d", line);

            const lastPoint = data.at(-1);
            if (lastPoint) {
                const labelY = getNonOverlappingY(y(lastPoint.OBS_VALUE));
                svg.append("text")
                    .attr("x", x(lastPoint.TIME_PERIOD) + 5)
                    .attr("y", labelY)
                    .attr("fill", lineColor)
                    .style("font-size", "12px")
                    .text(label);
            }
        }
    }
})();
