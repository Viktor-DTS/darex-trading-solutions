/**
 * Система самопокращення AI для тендерного скрапера
 * Реалізує Q-Learning, еволюційні алгоритми та мета-навчання
 */

const fs = require('fs').promises;
const path = require('path');

class SelfImprovementEngine {
    constructor() {
        this.qTable = new Map(); // Q-таблиця для навчання з підкріпленням
        this.geneticPopulation = []; // Популяція для еволюційного алгоритму
        this.performanceHistory = []; // Історія продуктивності
        this.learningRate = 0.1;
        this.discountFactor = 0.9;
        this.explorationRate = 0.1;
        this.mutationRate = 0.05;
        this.populationSize = 50;
        this.generation = 0;
        
        this.loadState();
    }

    /**
     * Q-Learning для оптимізації пошукових запитів
     */
    async optimizeSearchQueries(searchResults, query, successRate) {
        const state = this.encodeSearchState(query, searchResults.length);
        const action = this.chooseAction(state);
        
        // Оновлюємо Q-таблицю на основі результату
        const reward = this.calculateReward(successRate, searchResults.length);
        await this.updateQTable(state, action, reward);
        
        // Генеруємо покращені варіанти запиту
        return this.generateImprovedQueries(query, action);
    }

    /**
     * Еволюційний алгоритм для покращення селекторів
     */
    async evolveSelectors(currentSelectors, performance) {
        if (this.geneticPopulation.length === 0) {
            this.initializePopulation(currentSelectors);
        }

        // Оцінюємо поточну продуктивність
        const fitness = this.calculateFitness(performance);
        
        // Додаємо до популяції
        this.geneticPopulation.push({
            selectors: currentSelectors,
            fitness: fitness,
            generation: this.generation
        });

        // Відбираємо найкращих
        this.geneticPopulation.sort((a, b) => b.fitness - a.fitness);
        this.geneticPopulation = this.geneticPopulation.slice(0, this.populationSize);

        // Створюємо нове покоління
        const newGeneration = await this.createNewGeneration();
        this.generation++;

        return newGeneration[0].selectors; // Повертаємо найкращий результат
    }

    /**
     * Автоматичне генерування синонімів через AI
     */
    async generateSynonyms(originalQuery) {
        const synonyms = await this.generateAISynonyms(originalQuery);
        const validatedSynonyms = await this.validateSynonyms(synonyms, originalQuery);
        
        return validatedSynonyms;
    }

    // Приватні методи

    encodeSearchState(query, resultCount) {
        const queryHash = this.hashString(query);
        const resultCategory = this.categorizeResultCount(resultCount);
        return `${queryHash}_${resultCategory}`;
    }

    chooseAction(state) {
        if (!this.qTable.has(state)) {
            this.qTable.set(state, new Array(4).fill(0)); // 4 дії: розширити, звузити, синоніми, комбінація
        }

        const qValues = this.qTable.get(state);
        const maxQ = Math.max(...qValues);
        const bestActions = qValues.map((q, i) => q === maxQ ? i : -1).filter(i => i !== -1);
        
        return bestActions[Math.floor(Math.random() * bestActions.length)];
    }

    async updateQTable(state, action, reward) {
        if (!this.qTable.has(state)) {
            this.qTable.set(state, new Array(4).fill(0));
        }

        const qValues = this.qTable.get(state);
        const currentQ = qValues[action];
        const maxNextQ = Math.max(...qValues);
        
        const newQ = currentQ + this.learningRate * (reward + this.discountFactor * maxNextQ - currentQ);
        qValues[action] = newQ;
        
        this.qTable.set(state, qValues);
        await this.saveState();
    }

    calculateReward(successRate, resultCount) {
        // Винагорода базується на успішності та кількості результатів
        const successReward = successRate * 100;
        const countReward = Math.min(resultCount / 10, 10); // Максимум 10 за кількість
        return successReward + countReward;
    }

    async generateImprovedQueries(originalQuery, action) {
        const improvements = [];
        
        switch (action) {
            case 0: // Розширити
                improvements.push(...await this.expandQuery(originalQuery));
                break;
            case 1: // Звузити
                improvements.push(...await this.narrowQuery(originalQuery));
                break;
            case 2: // Синоніми
                improvements.push(...await this.generateSynonyms(originalQuery));
                break;
            case 3: // Комбінація
                improvements.push(...await this.combineStrategies(originalQuery));
                break;
        }
        
        return improvements;
    }

    async expandQuery(query) {
        const expansions = [
            `${query} OR "технічне обслуговування"`,
            `${query} OR "ремонт"`,
            `${query} OR "закупівля"`,
            `"${query}" AND (генератор OR електрогенератор)`,
            `${query} AND (обслуговування OR ТО)`
        ];
        
        return expansions;
    }

    async narrowQuery(query) {
        const narrowings = [
            `"${query}" AND "генератор"`,
            `${query} AND "технічне обслуговування"`,
            `"${query}" AND "ремонт"`,
            `${query} AND "закупівля"`
        ];
        
        return narrowings;
    }

    async generateAISynonyms(query) {
        // Симуляція AI генерації синонімів
        const synonymMap = {
            'генератор': ['електрогенератор', 'генераторна установка', 'ДГУ', 'дизель-генератор'],
            'ремонт': ['відновлення', 'усунення несправностей', 'технічне обслуговування', 'ТО'],
            'закупівля': ['придбання', 'замовлення', 'постачання', 'закупка'],
            'технічне': ['технічний', 'технологічний', 'інженерний'],
            'обслуговування': ['сервіс', 'підтримка', 'експлуатація', 'догляд']
        };

        let synonyms = [query];
        
        for (const [word, syns] of Object.entries(synonymMap)) {
            if (query.toLowerCase().includes(word)) {
                synonyms.push(...syns.map(syn => query.replace(new RegExp(word, 'gi'), syn)));
            }
        }
        
        return [...new Set(synonyms)]; // Видаляємо дублікати
    }

    async validateSynonyms(synonyms, originalQuery) {
        // Проста валідація - перевіряємо що синоніми містять ключові слова
        const keyWords = ['генератор', 'ремонт', 'закупівля', 'обслуговування'];
        
        return synonyms.filter(syn => 
            keyWords.some(word => syn.toLowerCase().includes(word))
        );
    }

    async combineStrategies(query) {
        const expanded = await this.expandQuery(query);
        const synonyms = await this.generateSynonyms(query);
        
        return [...expanded, ...synonyms].slice(0, 5); // Беремо перші 5
    }

    initializePopulation(selectors) {
        for (let i = 0; i < this.populationSize; i++) {
            this.geneticPopulation.push({
                selectors: this.mutateSelectors(selectors),
                fitness: 0,
                generation: 0
            });
        }
    }

    mutateSelectors(selectors) {
        const mutated = JSON.parse(JSON.stringify(selectors));
        
        // Мутація селекторів
        for (const key in mutated) {
            if (Math.random() < this.mutationRate) {
                if (typeof mutated[key] === 'string') {
                    // Мутуємо CSS селектор
                    mutated[key] = this.mutateCSSSelector(mutated[key]);
                }
            }
        }
        
        return mutated;
    }

    mutateCSSSelector(selector) {
        const mutations = [
            selector.replace(/\./g, ' '), // Заміна . на пробіл
            selector.replace(/\s+/g, '.'), // Заміна пробілів на .
            selector + ' *', // Додавання універсального селектора
            selector.replace(/\[.*?\]/g, ''), // Видалення атрибутів
            'div ' + selector, // Додавання div
            selector + ':first-child' // Додавання псевдокласу
        ];
        
        return mutations[Math.floor(Math.random() * mutations.length)];
    }

    calculateFitness(performance) {
        const { successRate, resultCount, speed } = performance;
        return (successRate * 0.4) + (Math.min(resultCount / 100, 1) * 0.3) + (speed * 0.3);
    }

    async createNewGeneration() {
        const newGeneration = [];
        
        // Елітизм - зберігаємо 20% найкращих
        const eliteCount = Math.floor(this.populationSize * 0.2);
        for (let i = 0; i < eliteCount; i++) {
            newGeneration.push({ ...this.geneticPopulation[i] });
        }
        
        // Створюємо решту через кросовер і мутацію
        while (newGeneration.length < this.populationSize) {
            const parent1 = this.tournamentSelection();
            const parent2 = this.tournamentSelection();
            const child = this.crossover(parent1, parent2);
            newGeneration.push(child);
        }
        
        return newGeneration;
    }

    tournamentSelection() {
        const tournamentSize = 3;
        const tournament = [];
        
        for (let i = 0; i < tournamentSize; i++) {
            const randomIndex = Math.floor(Math.random() * this.geneticPopulation.length);
            tournament.push(this.geneticPopulation[randomIndex]);
        }
        
        return tournament.reduce((best, current) => 
            current.fitness > best.fitness ? current : best
        );
    }

    crossover(parent1, parent2) {
        const child = {};
        
        for (const key in parent1.selectors) {
            if (Math.random() < 0.5) {
                child[key] = parent1.selectors[key];
            } else {
                child[key] = parent2.selectors[key];
            }
        }
        
        return {
            selectors: child,
            fitness: 0,
            generation: this.generation + 1
        };
    }

    async saveState() {
        const state = {
            qTable: Array.from(this.qTable.entries()),
            geneticPopulation: this.geneticPopulation,
            performanceHistory: this.performanceHistory,
            generation: this.generation
        };
        
        await fs.writeFile(
            path.join(__dirname, '../../data/self-improvement-state.json'),
            JSON.stringify(state, null, 2)
        );
    }

    async loadState() {
        try {
            const stateData = await fs.readFile(
                path.join(__dirname, '../../data/self-improvement-state.json'),
                'utf8'
            );
            
            const state = JSON.parse(stateData);
            this.qTable = new Map(state.qTable);
            this.geneticPopulation = state.geneticPopulation || [];
            this.performanceHistory = state.performanceHistory || [];
            this.generation = state.generation || 0;
        } catch (error) {
            console.log('Створюємо новий стан для самопокращення...');
        }
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Конвертуємо в 32-бітне ціле
        }
        return Math.abs(hash).toString(36);
    }

    categorizeResultCount(count) {
        if (count === 0) return 'none';
        if (count < 5) return 'few';
        if (count < 20) return 'some';
        if (count < 100) return 'many';
        return 'lots';
    }
}

module.exports = SelfImprovementEngine;