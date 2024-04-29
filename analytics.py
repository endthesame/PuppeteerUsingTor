import os
import json
import re

def check_year_format(value):
    if re.match(r'\d{4}-\d{2}-\d{2}', value):
        return value[:4]
    else:
        return "wrong format"

def count_field_values(field_counts, key, value):
    if key not in field_counts:
        field_counts[key] = 0
    if value != '':
        field_counts[key] += 1

def update_year_distribution(year_distribution, key, value):
    if key == '203':
        year = check_year_format(value)
        if year != "wrong format":
            if year not in year_distribution:
                year_distribution[year] = 0
            year_distribution[year] += 1

def collect_empty_fields(empty_fields, key, value, filename, default_value):
    if value == '':
        if key not in empty_fields:
            empty_fields[key] = []
        empty_fields[key].append((filename, default_value))

def save_results(output_folder, field_counts, year_distribution, empty_fields):
    with open(os.path.join(output_folder, 'field_counts.txt'), 'w') as f:
        for key, count in field_counts.items():
            f.write('{}: {}\n'.format(key, count))

    with open(os.path.join(output_folder, 'year_distribution.txt'), 'w') as f:
        for year, count in year_distribution.items():
            f.write('{}: {}\n'.format(year, count))

    for key, values in empty_fields.items():
        file_path = os.path.join(output_folder, 'empty_{}.txt'.format(key))
        with open(file_path, 'w') as f:
            for filename, value in values:
                f.write('{} {}\n'.format(filename, value))

def process_file(file_path, field_counts, year_distribution, empty_fields):
    with open(file_path, 'r') as f:
        data = json.load(f)
        for key, value in data.items():
            count_field_values(field_counts, key, value)
            update_year_distribution(year_distribution, key, value)
            collect_empty_fields(empty_fields, key, value, os.path.basename(file_path), data.get('217', ''))

def analyze_files(folder_path):
    field_counts = {}
    year_distribution = {}
    empty_fields = {}

    for filename in os.listdir(folder_path):
        if filename.endswith('.json'):
            file_path = os.path.join(folder_path, filename)
            process_file(file_path, field_counts, year_distribution, empty_fields)
    
    return field_counts, year_distribution, empty_fields

def main():
    folder_path = 'output3/ieee_fullbooks/jsons'
    output_folder = 'output3/ieee_fullbooks/analytics/'

    field_counts, year_distribution, empty_fields = analyze_files(folder_path)
    save_results(output_folder, field_counts, year_distribution, empty_fields)

if __name__ == "__main__":
    main()
