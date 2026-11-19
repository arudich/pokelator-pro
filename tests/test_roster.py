"""Regression for source records sharing forms (base, regional and Mega)."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('build_roster', Path(__file__).resolve().parents[1] / 'scripts/build_roster.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class RosterTests(unittest.TestCase):
    def test_regional_record_and_mega_parent_supply_their_own_moves(self):
        def form(name, showdown):
            return {'saved_name':name,'showdown_name':showdown,'form_kind':'Base',
                    'hp':170,'attack':100,'defense':100,'sp_attack':100,'sp_defense':100,'speed':100,
                    'types':['Water'],'abilities':'Test',
                    'image_path':f'pokemon_champions_assets/pokemon/{name}.png'}
        forms = [form('Slowbro','Slowbro'), form('Galarian Slowbro','Slowbro-Galar'),
                 form('Mega Slowbro','Slowbro-Mega')]
        def record(name, moves):
            return {'showdownName':name,'summary':{'forms':forms},'learnableMoveNames':moves}
        source={'generatedAt':'fixture', 'pokemon':[
            record('Slowbro',['Surf']),record('Slowbro-Galar',['Shell Side Arm'])]}
        result={p['name']:p for p in builder.build(source)['pokemon']}
        self.assertEqual(result['Slowbro']['moves'],['Surf'])
        self.assertEqual(result['Galarian Slowbro']['moves'],['Shell Side Arm'])
        self.assertEqual(result['Mega Slowbro']['moves'],['Surf'])
        self.assertEqual(result['Mega Slowbro']['stats']['hp'],170)

    def test_usage_percentages_come_from_downloaded_csv_per_format(self):
        import tempfile
        form={'saved_name':'Slowbro','showdown_name':'Slowbro','form_kind':'Base',
              'hp':170,'attack':100,'defense':100,'sp_attack':100,'sp_defense':100,'speed':100,
              'types':['Water'],'abilities':'Test',
              'image_path':'pokemon_champions_assets/pokemon/Slowbro.png'}
        sources=[{'season':'Current','format':format_name,
                  'path':f'pokemon_champions_assets/battle_data/{format_name}/Slowbro.csv'}
                 for format_name in ['Singles','Doubles']]
        index={'generatedAt':'fixture','pokemon':[{'showdownName':'Slowbro',
               'summary':{'forms':[form]},'learnableMoveNames':['Surf'],'battleDataCsvs':sources}]}
        with tempfile.TemporaryDirectory() as temp:
            for format_name, percent in [('Singles',75.2),('Doubles',31.4)]:
                path=Path(temp)/format_name/'Slowbro.csv'
                path.parent.mkdir()
                content=(f'pokemon,category,rank,name,percentage,hp_points,attack_points,defense_points,sp_atk_points,sp_def_points,speed_points\nSlowbro,move,1,Surf,{percent}%,,,,,,\n'
                                'Slowbro,held_item,1,Life Orb,12.5%,,,,,,\n'
                                'Slowbro,ability,1,Regenerator,98.7%,,,,,,\n'
                                'Slowbro,stat_alignment,1,Bold,59.8%,,,,,,\n'
                                'Slowbro,stat_alignment,2,Impish,21.9%,,,,,,\n'
                                'Slowbro,stat_points,1,,16.6%,32,0,32,0,2,0\n')
                position=17 if format_name=='Singles' else 9
                path.write_text(content.replace('pokemon,category','pokemon,column_position,category')
                    .replace('\nSlowbro,',f'\nSlowbro,{position},'))
            result=builder.build(index,temp)['pokemon'][0]
            self.assertEqual(result['usage']['Singles']['moves'][0]['percent'],75.2)
            self.assertEqual(result['usage']['Doubles']['moves'][0]['percent'],31.4)
            self.assertEqual(result['usage']['Singles']['rank'],17)
            self.assertEqual(result['usage']['Doubles']['rank'],9)
            self.assertEqual(result['usage']['Doubles']['items'][0]['percent'],12.5)
            self.assertEqual(result['usage']['Singles']['abilities'],[{'name':'Regenerator','percent':98.7,'rank':1}])
            self.assertEqual(result['usage']['Singles']['natures'],[{'name':'Bold','percent':59.8,'rank':1},{'name':'Impish','percent':21.9,'rank':2}])

            self.assertEqual(result['usage']['Singles']['spreads'][0],
                             {'rank':1,'percent':16.6,'investment':{'hp':32,'atk':0,'def':32,'spa':0,'spd':2,'spe':0}})
            bad_path=Path(temp)/'Singles'/'Slowbro.csv'
            original=bad_path.read_text()
            bad_path.write_text(original.replace('Slowbro,17,held_item','Slowbro,18,held_item'))
            with self.assertRaisesRegex(ValueError,'Invalid species usage rank'):
                builder.build(index,temp)
            bad_path.write_text(original.replace('32,0,32,0,2,0','32,32,32,0,2,0'))
            with self.assertRaisesRegex(ValueError,'Invalid stat spread'):
                builder.build(index,temp)
