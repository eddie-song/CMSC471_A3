(function () {
    const margin = { top: 60, right: 130, bottom: 60, left: 70 };
    const width = 900 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;
    let allData, countryCodes, minYear, maxYear;

    const svg2 = d3.select("#vis2")
        .append("svg")
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
        const latestYear = d3.max(allData, d => d.TIME_PERIOD);
        minYear = d3.min(allData, d => d.TIME_PERIOD);
        maxYear = d3.max(allData, d => d.TIME_PERIOD);

        const allCountryCodes = Array.from(new Set(allData.map(d => d.REF_AREA))).sort();
        const incompleteCountries = [];
        const completeCountries = [];

        allCountryCodes.forEach(code => {
            const hasLatest = allData.some(d => d.REF_AREA === code && d.TIME_PERIOD === latestYear);
            if (!hasLatest) incompleteCountries.push(code);
            else completeCountries.push(code);
        });

        countryCodes = [...incompleteCountries, ...completeCountries];

        const checkboxContainer = d3.select("#checkbox-container-black");
        checkboxContainer.selectAll("div")
            .data(countryCodes)
            .enter()
            .append("div")
            .attr("class", "checkbox")
            .each(function (d) {
                d3.select(this)
                    .append("input")
                    .attr("type", "checkbox")
                    .attr("value", d)
                    .attr("id", `black-chk-${d}`)
                    .property("checked", false);

                d3.select(this)
                    .append("label")
                    .attr("for", `black-chk-${d}`)
                    .text(` ${d}`);
            });

        renderBlackHat([]);

        checkboxContainer.selectAll("input[type=checkbox]").on("change", () => {
            const selected = getSelectedCountries();
            renderBlackHat(selected);
        });

    }).catch(console.error);

    function getSelectedCountries() {
        const selected = [];
        d3.selectAll("#checkbox-container-black input:checked").each(function () {
            selected.push(this.value);
        });
        return selected;
    }

    function renderBlackHat(selectedCountries) {
        svg2.selectAll("*").remove();
        const filtered = allData.filter(d => selectedCountries.includes(d.REF_AREA));
        const nested = d3.group(filtered, d => d.REF_AREA);

        const selectedTotals = d3.rollups(
            filtered,
            v => d3.sum(v, d => d.OBS_VALUE),
            d => d.TIME_PERIOD
        ).map(([year, value]) => ({ TIME_PERIOD: +year, OBS_VALUE: value }))
            .sort((a, b) => a.TIME_PERIOD - b.TIME_PERIOD);

        const yMin = d3.min(filtered, d => d.OBS_VALUE) || 0;
        const yMax = d3.max([
            d3.max(filtered, d => d.OBS_VALUE) || 0,
            d3.max(selectedTotals, d => d.OBS_VALUE) || 0
        ]);

        const norm = d3.scaleLinear().domain([maxYear, minYear]).range([0, 1]);
        const skewed = d3.scalePow().exponent(1.2).domain([0, 1]).range([0, width]);
        const x = d => skewed(norm(d));

        const y = d3.scaleLinear()
            .domain([yMin * 0.9, yMax || 1])
            .range([height, 0]);

        const yAxis = d3.axisLeft(y);
        svg2.append("g").call(yAxis);
        const tickYears = d3.range(minYear, maxYear + 1, 1);
        const xAxisGroup = svg2.append("g").attr("transform", `translate(0,${height})`);
        xAxisGroup.append("line").attr("x1", 0).attr("x2", width).attr("stroke", "black");

        xAxisGroup.selectAll("line.tick")
            .data(tickYears)
            .enter()
            .append("line")
            .attr("x1", d => x(d))
            .attr("x2", d => x(d))
            .attr("y1", 0)
            .attr("y2", 6)
            .attr("stroke", "black");

        xAxisGroup.selectAll("text")
            .data(tickYears)
            .enter()
            .append("text")
            .attr("x", d => x(d))
            .attr("y", 20)
            .style("text-anchor", "middle")
            .style("font-size", "10px")
            .text(d => d);

        svg2.append("text")
            .attr("x", width / 2)
            .attr("y", height + 40)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .text("Year");

        svg2.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2)
            .attr("y", -50)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .text("Environmental Progress (kg CO₂e)");

        svg2.append("text")
            .attr("x", width / 2)
            .attr("y", -30)
            .attr("text-anchor", "middle")
            .style("font-size", "18px")
            .style("font-weight", "bold")
            .text("Greenhouse Gas Emissions Over Time");

        const countryTotals = new Map(
            countryCodes.map(code => {
                const total = d3.sum(allData.filter(d => d.REF_AREA === code), d => d.OBS_VALUE);
                return [code, total];
            })
        );

        const color = d => countryTotals.get(d) <= 100 ? "green" : "red";

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

            svg2.append("path")
                .datum(values)
                .attr("fill", "none")
                .attr("stroke", color(country))
                .attr("stroke-width", 2)
                .attr("d", line);

            svg2.selectAll(`circle-${country}`)
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

            const first = values.filter(d => !isNaN(d.OBS_VALUE)).at(0);
            if (first) {
                const labelY = getNonOverlappingY(y(first.OBS_VALUE));
                svg2.append("text")
                    .attr("x", x(first.TIME_PERIOD) + 8)
                    .attr("y", labelY)
                    .attr("fill", color(country))
                    .style("font-size", "12px")
                    .attr("text-anchor", "start")
                    .text(country);
            }
        }

        svg2.append("path")
            .datum(selectedTotals)
            .attr("fill", "none")
            .attr("stroke", "black")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "5,2")
            .attr("d", line);

        const firstTotal = selectedTotals.at(0);
        if (firstTotal) {
            const labelY = getNonOverlappingY(y(firstTotal.OBS_VALUE));
            svg2.append("text")
                .attr("x", x(firstTotal.TIME_PERIOD) + 8)
                .attr("y", labelY)
                .attr("fill", "black")
                .style("font-size", "12px")
                .attr("text-anchor", "start")
                .text("Total (Selected)");
        }
    }
})();
